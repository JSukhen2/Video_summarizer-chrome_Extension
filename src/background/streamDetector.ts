import type { DetectedStream, StreamType } from '../types';

// webRequest 응답 타입 정의
interface WebResponseDetails {
  url: string;
  tabId: number;
  type: string;
  statusCode?: number;
  responseHeaders?: Array<{ name: string; value?: string }>;
}

/**
 * 네트워크 요청을 감시하여 비디오 스트림을 감지하는 클래스
 * Video DownloadHelper 방식 참고
 */
export class StreamDetector {
  // 탭별 감지된 스트림 저장
  private streams: Map<number, DetectedStream[]> = new Map();
  
  // 비디오 관련 MIME 타입 (확장)
  private readonly VIDEO_MIME_TYPES = [
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/x-flv',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/3gpp',
    'video/mpeg',
    'video/mp2t',
    'application/x-mpegURL',
    'application/vnd.apple.mpegurl',
    'application/dash+xml',
    'application/octet-stream', // 일부 서버에서 비디오를 이 타입으로 전송
  ];

  // 비디오 파일 확장자 패턴 (확장)
  private readonly VIDEO_URL_PATTERNS = [
    /\.mp4(?:\?|$|#)/i,
    /\.webm(?:\?|$|#)/i,
    /\.m3u8(?:\?|$|#)/i,
    /\.mpd(?:\?|$|#)/i,
    /\.flv(?:\?|$|#)/i,
    /\.ts(?:\?|$|#)/i,
    /\.m4s(?:\?|$|#)/i,
    /\.m4v(?:\?|$|#)/i,
    /\.mov(?:\?|$|#)/i,
    /\.avi(?:\?|$|#)/i,
    /\.mkv(?:\?|$|#)/i,
    /\.3gp(?:\?|$|#)/i,
    /\/manifest(?:\.m3u8|\.mpd)?/i,
    /\/playlist\.m3u8/i,
    /\/master\.m3u8/i,
    /\/index\.m3u8/i,
    /videoplayback/i,
    /googlevideo\.com/i,
    /ytimg\.com.*\.webm/i,
    /\.akamaihd\.net.*video/i,
    /cloudfront.*video/i,
    /\.fbcdn\.net.*video/i,
    /twimg\.com.*video/i,
    /\.tiktokcdn\.com.*video/i,
    /\.instagram\.com.*video/i,
    /vimeocdn\.com/i,
    /player\.vimeo\.com/i,
    /dailymotion\.com.*video/i,
    /\.brightcove/i,
    /\.jwplatform/i,
    /\.jwpcdn/i,
    /bitmovin/i,
    /\.hls\./i,
    /\.dash\./i,
    /streaming/i,
    /media.*\.mp4/i,
    /video.*\.mp4/i,
    /cdn.*video/i,
  ];

  // 제외할 URL 패턴 (광고, 트래킹 등)
  private readonly EXCLUDE_PATTERNS = [
    /googleads/i,
    /doubleclick/i,
    /googlesyndication/i,
    /googleadservices/i,
    /analytics/i,
    /tracking/i,
    /pixel/i,
    /beacon/i,
    /telemetry/i,
    /\.gif(?:\?|$)/i,
    /\.png(?:\?|$)/i,
    /\.jpg(?:\?|$)/i,
    /\.jpeg(?:\?|$)/i,
    /\.svg(?:\?|$)/i,
    /\.ico(?:\?|$)/i,
    /\.woff/i,
    /\.ttf/i,
    /\.css(?:\?|$)/i,
    /\.js(?:\?|$)/i,
    /favicon/i,
    /thumbnail/i,
    /preview/i,
    /poster/i,
  ];

  constructor() {
    this.setupListeners();
  }

  /**
   * 네트워크 요청 리스너 설정
   */
  private setupListeners() {
    // 응답 시작 시 감시
    chrome.webRequest.onResponseStarted.addListener(
      (details) => this.handleResponse(details as WebResponseDetails),
      { urls: ['<all_urls>'] },
      ['responseHeaders']
    );

    // 헤더 수신 시에도 감시 (일부 스트림은 여기서만 감지됨)
    chrome.webRequest.onHeadersReceived.addListener(
      (details) => {
        this.handleResponse(details as WebResponseDetails);
        return {}; // 반환값 필요
      },
      { urls: ['<all_urls>'] },
      ['responseHeaders']
    );

    // 탭 닫힐 때 스트림 정보 정리
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.streams.delete(tabId);
    });

    // 탭 URL 변경 시 스트림 정보 초기화
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === 'loading' && changeInfo.url) {
        this.streams.set(tabId, []);
      }
    });

    console.log('[StreamDetector] Listeners initialized');
  }

  /**
   * 응답 처리
   */
  private handleResponse(details: WebResponseDetails) {
    const { url, tabId, responseHeaders, type, statusCode } = details;

    // 탭 ID가 없거나 유효하지 않으면 무시
    if (tabId < 0) return;

    // 실패한 요청 무시
    if (statusCode && (statusCode < 200 || statusCode >= 400)) return;

    // 제외 패턴 확인
    if (this.EXCLUDE_PATTERNS.some(pattern => pattern.test(url))) {
      return;
    }

    // Content-Type 헤더 확인
    const contentType = responseHeaders?.find(
      h => h.name.toLowerCase() === 'content-type'
    )?.value?.toLowerCase() || '';

    // Content-Length 헤더 확인
    const contentLength = responseHeaders?.find(
      h => h.name.toLowerCase() === 'content-length'
    )?.value;

    const size = contentLength ? parseInt(contentLength, 10) : undefined;

    // 비디오 MIME 타입 확인
    const isVideoMime = this.VIDEO_MIME_TYPES.some(mime => 
      contentType.includes(mime.toLowerCase())
    );

    // URL 패턴 확인
    const isVideoUrl = this.VIDEO_URL_PATTERNS.some(pattern => 
      pattern.test(url)
    );

    // 미디어 타입 요청인지 확인
    const isMediaType = type === 'media' || type === 'xmlhttprequest' || type === 'other';

    // 비디오로 판단되면 저장
    if (isVideoMime || isVideoUrl || (isMediaType && this.looksLikeVideo(url, contentType))) {
      const streamType = this.detectStreamType(url, contentType);
      
      // 너무 작은 파일 무시 (5KB 미만, 세그먼트 제외)
      if (size && size < 5000 && streamType !== 'hls' && streamType !== 'dash') {
        return;
      }

      const stream: DetectedStream = {
        url,
        type: streamType,
        size,
        quality: this.detectQuality(url),
        contentType: contentType || undefined,
        timestamp: Date.now()
      };

      this.addStream(tabId, stream);
      
      console.log('[StreamDetector] Video detected:', {
        tabId,
        type: streamType,
        size: size ? `${(size / 1024 / 1024).toFixed(2)} MB` : 'unknown',
        url: url.substring(0, 80) + '...'
      });
    }
  }

  /**
   * 비디오처럼 보이는지 추가 확인
   */
  private looksLikeVideo(url: string, contentType: string): boolean {
    // octet-stream이면서 비디오 관련 키워드가 있는 경우
    if (contentType.includes('octet-stream')) {
      return /video|media|stream|play|watch/i.test(url);
    }
    
    // URL에 비디오 관련 키워드가 많은 경우
    const videoKeywords = ['video', 'media', 'stream', 'play', 'watch', 'clip', 'movie'];
    const matches = videoKeywords.filter(kw => url.toLowerCase().includes(kw));
    return matches.length >= 1;
  }

  /**
   * 스트림 타입 감지
   */
  private detectStreamType(url: string, contentType: string): StreamType {
    const urlLower = url.toLowerCase();
    const ctLower = contentType.toLowerCase();

    if (urlLower.includes('.m3u8') || ctLower.includes('mpegurl') || ctLower.includes('x-mpegurl')) {
      return 'hls';
    }
    if (urlLower.includes('.mpd') || ctLower.includes('dash')) {
      return 'dash';
    }
    if (urlLower.includes('.mp4') || urlLower.includes('.m4v') || ctLower.includes('mp4')) {
      return 'mp4';
    }
    if (urlLower.includes('.webm') || ctLower.includes('webm')) {
      return 'webm';
    }
    if (urlLower.includes('.flv') || ctLower.includes('flv')) {
      return 'flv';
    }
    if (urlLower.includes('.ts') || urlLower.includes('.m4s') || ctLower.includes('mp2t')) {
      return 'hls'; // TS 세그먼트는 HLS로 분류
    }
    return 'unknown';
  }

  /**
   * 비디오 품질 감지 (URL에서 추출)
   */
  private detectQuality(url: string): string | undefined {
    const patterns = [
      /(\d{3,4})p/i,
      /(\d{3,4})x\d{3,4}/i,
      /\d{3,4}x(\d{3,4})/i,
      /quality[=_-]?(\w+)/i,
      /itag[=_](\d+)/i,
      /res[=_](\d+)/i,
      /[_-](hd|sd|hq|lq|4k|2k|1080|720|480|360|240|144)[_-]/i,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        const val = match[1];
        // itag를 품질로 변환
        if (/^\d+$/.test(val)) {
          const num = parseInt(val);
          if (num >= 1000) return `${num}p`;
          // YouTube itag 매핑
          const itagMap: Record<number, string> = {
            18: '360p', 22: '720p', 37: '1080p', 38: '3072p',
            82: '360p 3D', 83: '480p 3D', 84: '720p 3D', 85: '1080p 3D',
            133: '240p', 134: '360p', 135: '480p', 136: '720p', 137: '1080p',
            138: '2160p', 160: '144p', 242: '240p', 243: '360p', 244: '480p',
            247: '720p', 248: '1080p', 271: '1440p', 313: '2160p',
          };
          if (itagMap[num]) return itagMap[num];
        }
        return val;
      }
    }

    return undefined;
  }

  /**
   * 스트림 추가 (중복 제거)
   */
  private addStream(tabId: number, stream: DetectedStream) {
    const existing = this.streams.get(tabId) || [];
    
    // 동일한 URL이 이미 있으면 무시
    if (existing.some(s => s.url === stream.url)) {
      return;
    }

    // 유사한 URL 체크 (쿼리 파라미터만 다른 경우)
    const baseUrl = stream.url.split('?')[0];
    const hasSimilar = existing.some(s => {
      const existingBase = s.url.split('?')[0];
      return existingBase === baseUrl && s.type === stream.type;
    });

    if (hasSimilar && stream.type !== 'hls' && stream.type !== 'dash') {
      return;
    }

    existing.push(stream);
    
    // 최대 30개까지만 저장
    if (existing.length > 30) {
      existing.shift();
    }
    
    this.streams.set(tabId, existing);

    // 스트림 감지 알림
    this.notifyStreamDetected(tabId, stream);
  }

  /**
   * 스트림 감지 알림
   */
  private notifyStreamDetected(tabId: number, stream: DetectedStream) {
    chrome.runtime.sendMessage({
      type: 'STREAM_DETECTED',
      payload: stream,
      tabId
    }).catch(() => {
      // Popup이 열려있지 않으면 무시
    });
  }

  /**
   * 특정 탭의 스트림 목록 반환
   */
  getStreams(tabId: number): DetectedStream[] {
    return this.streams.get(tabId) || [];
  }

  /**
   * 특정 탭의 스트림 초기화
   */
  clearStreams(tabId: number) {
    this.streams.set(tabId, []);
  }

  /**
   * 모든 스트림 정보 반환 (디버깅용)
   */
  getAllStreams(): Map<number, DetectedStream[]> {
    return this.streams;
  }
}

// 싱글톤 인스턴스
export const streamDetector = new StreamDetector();
