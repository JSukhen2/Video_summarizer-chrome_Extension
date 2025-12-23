import type { VideoInfo, DetectedStream, StreamType } from '../types';

/**
 * 현재 페이지에서 비디오를 감지하고 정보를 추출하는 클래스
 * DOM 분석 + 네트워크 스트림 감지 방식 사용
 */
export class VideoDetector {
  // 감지된 비디오 소스 저장
  private detectedSources: DetectedStream[] = [];

  /**
   * 페이지에서 모든 비디오 감지
   */
  detectAll(): VideoInfo[] {
    const videos: VideoInfo[] = [];

    // 1. YouTube 확인
    const youtubeInfo = this.detectYouTube();
    if (youtubeInfo) videos.push(youtubeInfo);

    // 2. Vimeo 확인
    const vimeoInfo = this.detectVimeo();
    if (vimeoInfo) videos.push(vimeoInfo);

    // 3. 일반 HTML5 비디오 확인
    const html5Videos = this.detectAllHTML5Videos();
    videos.push(...html5Videos);

    // 4. iframe 내 비디오 확인
    const iframeVideos = this.detectIframeVideos();
    videos.push(...iframeVideos);

    // 5. 소스 태그 분석
    const sourceVideos = this.detectSourceTags();
    videos.push(...sourceVideos);

    // 중복 제거
    return this.deduplicateVideos(videos);
  }

  /**
   * 메인 비디오 하나만 반환 (기존 호환성)
   */
  detect(): VideoInfo | null {
    const videos = this.detectAll();
    return videos.length > 0 ? videos[0] : null;
  }

  /**
   * YouTube 비디오 감지
   */
  private detectYouTube(): VideoInfo | null {
    const url = window.location.href;
    
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
      return null;
    }

    const videoId = this.extractYouTubeVideoId(url);
    if (!videoId) return null;

    // 비디오 제목 추출 (여러 셀렉터 시도)
    const titleSelectors = [
      'h1.ytd-video-primary-info-renderer',
      'h1.ytd-watch-metadata yt-formatted-string',
      '#title h1 yt-formatted-string',
      'meta[name="title"]'
    ];
    
    let title = document.title.replace(' - YouTube', '');
    for (const selector of titleSelectors) {
      const el = document.querySelector(selector);
      if (el?.textContent?.trim()) {
        title = el.textContent.trim();
        break;
      }
    }

    // 비디오 길이 추출
    const durationElement = document.querySelector('.ytp-time-duration');
    const duration = durationElement ? this.parseDuration(durationElement.textContent || '') : undefined;

    return {
      platform: 'youtube',
      videoId,
      title,
      duration,
      url,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    };
  }

  /**
   * YouTube 비디오 ID 추출
   */
  private extractYouTubeVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/shorts\/([^&\n?#]+)/,
      /youtube\.com\/live\/([^&\n?#]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  /**
   * Vimeo 비디오 감지
   */
  private detectVimeo(): VideoInfo | null {
    const url = window.location.href;
    
    if (!url.includes('vimeo.com')) {
      return null;
    }

    const videoIdMatch = url.match(/vimeo\.com\/(\d+)/);
    if (!videoIdMatch) return null;

    const videoId = videoIdMatch[1];
    const title = document.querySelector('h1')?.textContent?.trim() || document.title;

    return {
      platform: 'vimeo',
      videoId,
      title,
      url,
      thumbnailUrl: `https://vumbnail.com/${videoId}.jpg`
    };
  }

  /**
   * 모든 HTML5 비디오 감지
   */
  private detectAllHTML5Videos(): VideoInfo[] {
    const videos: VideoInfo[] = [];
    const videoElements = document.querySelectorAll('video');

    videoElements.forEach((video, index) => {
      const rect = video.getBoundingClientRect();
      const area = rect.width * rect.height;
      
      // 너무 작은 비디오 무시 (100x100 미만)
      if (area < 10000) return;

      // 비디오 소스 URL 추출
      let sourceUrl = video.src || video.currentSrc;
      
      // source 태그에서 추출
      if (!sourceUrl) {
        const sourceEl = video.querySelector('source');
        sourceUrl = sourceEl?.src || '';
      }

      // blob URL 처리
      const isBlobUrl = sourceUrl.startsWith('blob:');

      const info: VideoInfo = {
        platform: 'html5',
        title: this.extractVideoTitle(video) || `비디오 ${index + 1}`,
        duration: isFinite(video.duration) ? video.duration : undefined,
        url: window.location.href,
        sourceUrl: isBlobUrl ? undefined : sourceUrl,
        streams: this.extractVideoSources(video)
      };

      videos.push(info);
    });

    return videos;
  }

  /**
   * 비디오 요소에서 제목 추출
   */
  private extractVideoTitle(video: HTMLVideoElement): string | null {
    // 1. title 속성
    if (video.title) return video.title;

    // 2. aria-label
    const ariaLabel = video.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    // 3. 가장 가까운 제목 요소 찾기
    const parent = video.closest('article, section, div[class*="video"], div[class*="player"]');
    if (parent) {
      const heading = parent.querySelector('h1, h2, h3, h4, [class*="title"]');
      if (heading?.textContent) return heading.textContent.trim();
    }

    // 4. 페이지 제목 사용
    return document.title;
  }

  /**
   * 비디오 요소에서 소스 추출
   */
  private extractVideoSources(video: HTMLVideoElement): DetectedStream[] {
    const sources: DetectedStream[] = [];

    // 메인 src
    if (video.src && !video.src.startsWith('blob:')) {
      sources.push({
        url: video.src,
        type: this.detectStreamTypeFromUrl(video.src),
        timestamp: Date.now()
      });
    }

    // source 태그들
    video.querySelectorAll('source').forEach(source => {
      if (source.src && !source.src.startsWith('blob:')) {
        sources.push({
          url: source.src,
          type: this.detectStreamTypeFromUrl(source.src),
          contentType: source.type || undefined,
          timestamp: Date.now()
        });
      }
    });

    return sources;
  }

  /**
   * URL에서 스트림 타입 감지
   */
  private detectStreamTypeFromUrl(url: string): StreamType {
    if (/\.m3u8/i.test(url)) return 'hls';
    if (/\.mpd/i.test(url)) return 'dash';
    if (/\.mp4/i.test(url)) return 'mp4';
    if (/\.webm/i.test(url)) return 'webm';
    if (/\.flv/i.test(url)) return 'flv';
    return 'unknown';
  }

  /**
   * iframe 내 비디오 감지
   */
  private detectIframeVideos(): VideoInfo[] {
    const videos: VideoInfo[] = [];
    const iframes = document.querySelectorAll('iframe');

    iframes.forEach(iframe => {
      const src = iframe.src || iframe.getAttribute('data-src') || '';
      
      // YouTube embed
      const ytMatch = src.match(/youtube\.com\/embed\/([^?&]+)/);
      if (ytMatch) {
        videos.push({
          platform: 'youtube',
          videoId: ytMatch[1],
          title: iframe.title || 'YouTube 비디오',
          url: src,
          thumbnailUrl: `https://img.youtube.com/vi/${ytMatch[1]}/maxresdefault.jpg`
        });
        return;
      }

      // Vimeo embed
      const vimeoMatch = src.match(/player\.vimeo\.com\/video\/(\d+)/);
      if (vimeoMatch) {
        videos.push({
          platform: 'vimeo',
          videoId: vimeoMatch[1],
          title: iframe.title || 'Vimeo 비디오',
          url: src,
          thumbnailUrl: `https://vumbnail.com/${vimeoMatch[1]}.jpg`
        });
        return;
      }

      // 기타 비디오 플레이어 iframe
      if (src.includes('video') || src.includes('player') || src.includes('embed')) {
        videos.push({
          platform: 'html5',
          title: iframe.title || '임베드 비디오',
          url: src
        });
      }
    });

    return videos;
  }

  /**
   * source 태그 직접 분석
   */
  private detectSourceTags(): VideoInfo[] {
    const videos: VideoInfo[] = [];
    
    // 독립적인 source 태그 (video 외부)
    const sources = document.querySelectorAll('source[src*=".mp4"], source[src*=".webm"], source[src*=".m3u8"]');
    
    sources.forEach(source => {
      const video = source.closest('video');
      if (video) return; // video 내부의 source는 이미 처리됨

      const src = source.getAttribute('src');
      if (src) {
        videos.push({
          platform: 'html5',
          title: document.title,
          url: window.location.href,
          sourceUrl: src,
          streams: [{
            url: src,
            type: this.detectStreamTypeFromUrl(src),
            timestamp: Date.now()
          }]
        });
      }
    });

    return videos;
  }

  /**
   * 중복 비디오 제거
   */
  private deduplicateVideos(videos: VideoInfo[]): VideoInfo[] {
    const seen = new Set<string>();
    return videos.filter(video => {
      const key = video.videoId || video.sourceUrl || video.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * 시간 문자열을 초 단위로 변환
   */
  private parseDuration(durationStr: string): number {
    const parts = durationStr.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
  }

  /**
   * 스트림 추가 (외부에서 호출)
   */
  addDetectedStream(stream: DetectedStream) {
    if (!this.detectedSources.some(s => s.url === stream.url)) {
      this.detectedSources.push(stream);
    }
  }

  /**
   * 감지된 스트림 반환
   */
  getDetectedStreams(): DetectedStream[] {
    return this.detectedSources;
  }
}
