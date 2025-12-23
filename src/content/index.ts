import { VideoDetector } from './videoDetector';
import type { Message, VideoInfo } from '../types';

/**
 * Content Script - 웹페이지에서 실행되는 스크립트
 * DOM 분석을 통한 비디오 감지
 */
class ContentScript {
  private detector: VideoDetector;
  private detectedVideos: VideoInfo[] = [];
  private lastUrl: string = '';

  constructor() {
    this.detector = new VideoDetector();
    this.init();
  }

  private init() {
    // 페이지 로드 완료 후 비디오 감지
    if (document.readyState === 'complete') {
      this.detectVideos();
    } else {
      window.addEventListener('load', () => this.detectVideos());
    }

    // URL 변경 감지 (SPA 대응)
    this.observeUrlChange();

    // DOM 변경 감지 (동적 비디오 로딩 대응)
    this.observeDomChanges();

    // 메시지 리스너 등록
    this.setupMessageListener();

    console.log('[Video Summarizer] Content script loaded');
  }

  /**
   * 비디오 감지 실행
   */
  private detectVideos() {
    // 약간의 딜레이 후 감지 (동적 콘텐츠 로딩 대기)
    setTimeout(() => {
      this.detectedVideos = this.detector.detectAll();
      
      if (this.detectedVideos.length > 0) {
        console.log('[Video Summarizer] Videos detected:', this.detectedVideos.length);
        
        // 첫 번째 비디오 정보를 Background로 전송
        chrome.runtime.sendMessage({
          type: 'VIDEO_DETECTED',
          payload: this.detectedVideos[0]
        }).catch(() => {
          // Background script가 준비되지 않은 경우 무시
        });
      }
    }, 1000);
  }

  /**
   * URL 변경 감지 (YouTube 등 SPA에서 필요)
   */
  private observeUrlChange() {
    this.lastUrl = location.href;
    
    // History API 감시
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      this.handleUrlChange();
    };

    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      this.handleUrlChange();
    };

    window.addEventListener('popstate', () => this.handleUrlChange());

    // MutationObserver로 URL 변경 백업 감지
    const observer = new MutationObserver(() => {
      if (location.href !== this.lastUrl) {
        this.handleUrlChange();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * URL 변경 처리
   */
  private handleUrlChange() {
    if (location.href === this.lastUrl) return;
    
    this.lastUrl = location.href;
    console.log('[Video Summarizer] URL changed, re-detecting videos...');
    
    // 이전 감지 결과 초기화
    this.detectedVideos = [];
    
    // 새로운 감지 시작
    this.detectVideos();
  }

  /**
   * DOM 변경 감지 (동적 비디오 로딩)
   */
  private observeDomChanges() {
    let debounceTimer: ReturnType<typeof setTimeout>;
    
    const observer = new MutationObserver((mutations) => {
      // video 태그 추가 확인
      const hasNewVideo = mutations.some(mutation => {
        return Array.from(mutation.addedNodes).some(node => {
          if (node instanceof HTMLElement) {
            return node.tagName === 'VIDEO' || 
                   node.querySelector?.('video') !== null ||
                   node.tagName === 'IFRAME';
          }
          return false;
        });
      });

      if (hasNewVideo) {
        // 디바운스 처리
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          console.log('[Video Summarizer] New video element detected in DOM');
          this.detectVideos();
        }, 500);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * 메시지 리스너 설정
   */
  private setupMessageListener() {
    chrome.runtime.onMessage.addListener((message: Message, _sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) => {
      console.log('[Video Summarizer] Message received:', message.type);

      switch (message.type) {
        case 'GET_VIDEO_INFO':
          // 비디오 정보 요청 시 최신 정보로 갱신
          this.detectedVideos = this.detector.detectAll();
          
          sendResponse({
            type: 'VIDEO_INFO_RESPONSE',
            payload: this.detectedVideos.length > 0 ? this.detectedVideos[0] : null,
            videos: this.detectedVideos
          });
          break;

        case 'GET_YOUTUBE_TRANSCRIPT':
          // YouTube 자막 가져오기
          this.getYouTubeTranscript().then(result => {
            sendResponse(result);
          }).catch(() => {
            sendResponse({ transcript: null, segments: [] });
          });
          return true; // 비동기 응답

        case 'CAPTURE_VIDEO_FRAMES': {
          // 비디오 프레임 캡처
          const captureOptions = (message.payload && typeof message.payload === 'object' && !Array.isArray(message.payload))
            ? message.payload as { videoSelector?: string; intervalSeconds?: number; maxFrames?: number }
            : {};
          this.captureVideoFrames(captureOptions).then(result => {
            sendResponse(result);
          }).catch(error => {
            console.error('[Video Summarizer] 프레임 캡처 실패:', error);
            sendResponse({ frames: [], error: error.message });
          });
          return true; // 비동기 응답
        }

        default:
          sendResponse({ type: 'ERROR', payload: 'Unknown message type' });
      }

      return true; // 비동기 응답을 위해 true 반환
    });
  }

  /**
   * YouTube 자막 추출
   */
  private async getYouTubeTranscript(): Promise<{ transcript: string; segments: Array<{ start: number; text: string }> }> {
    // YouTube 페이지인지 확인
    if (!window.location.href.includes('youtube.com/watch')) {
      return { transcript: '', segments: [] };
    }

    try {
      // 방법 1: 자막 패널에서 직접 추출 시도
      const transcriptFromPanel = await this.extractFromTranscriptPanel();
      if (transcriptFromPanel.transcript) {
        console.log('[Video Summarizer] 자막 패널에서 추출 성공');
        return transcriptFromPanel;
      }

      // 방법 2: ytInitialPlayerResponse에서 자막 URL 추출
      const transcriptFromPlayer = await this.extractFromPlayerResponse();
      if (transcriptFromPlayer.transcript) {
        console.log('[Video Summarizer] Player Response에서 추출 성공');
        return transcriptFromPlayer;
      }

      console.log('[Video Summarizer] 자막을 찾을 수 없습니다');
      return { transcript: '', segments: [] };
    } catch (error) {
      console.error('[Video Summarizer] 자막 추출 실패:', error);
      return { transcript: '', segments: [] };
    }
  }

  /**
   * 자막 패널에서 직접 추출
   */
  private async extractFromTranscriptPanel(): Promise<{ transcript: string; segments: Array<{ start: number; text: string }> }> {
    // 이미 열려있는 자막 패널 찾기
    const transcriptPanel = document.querySelector('ytd-transcript-renderer, ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]');
    
    if (!transcriptPanel) {
      return { transcript: '', segments: [] };
    }

    // 자막 세그먼트 추출
    const segments: Array<{ start: number; text: string }> = [];
    const segmentElements = transcriptPanel.querySelectorAll('ytd-transcript-segment-renderer, yt-formatted-string.segment-text');
    
    segmentElements.forEach(el => {
      const timeEl = el.querySelector('.segment-timestamp, [class*="timestamp"]');
      const textEl = el.querySelector('.segment-text, yt-formatted-string');
      
      if (textEl?.textContent) {
        const timeText = timeEl?.textContent?.trim() || '0:00';
        const timeParts = timeText.split(':').map(Number);
        const startSeconds = timeParts.length === 3 
          ? timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2]
          : timeParts[0] * 60 + (timeParts[1] || 0);
        
        segments.push({
          start: startSeconds,
          text: textEl.textContent.trim()
        });
      }
    });

    const transcript = segments.map(s => `[${this.formatTime(s.start)}] ${s.text}`).join('\n');
    return { transcript, segments };
  }

  /**
   * ytInitialPlayerResponse에서 자막 추출
   */
  private async extractFromPlayerResponse(): Promise<{ transcript: string; segments: Array<{ start: number; text: string }> }> {
    try {
      // 페이지 스크립트에서 자막 데이터 찾기
      const scripts = document.querySelectorAll('script');
      let captionUrl = '';

      for (const script of scripts) {
        const content = script.textContent || '';
        
        // 자막 URL 패턴 찾기
        const captionMatch = content.match(/"captionTracks":\s*\[(.*?)\]/s);
        if (captionMatch) {
          const urlMatch = captionMatch[1].match(/"baseUrl":\s*"([^"]+)"/);
          if (urlMatch) {
            captionUrl = urlMatch[1].replace(/\\u0026/g, '&');
            break;
          }
        }
      }

      if (!captionUrl) {
        return { transcript: '', segments: [] };
      }

      // 자막 XML 가져오기
      const response = await fetch(captionUrl);
      const xml = await response.text();
      
      // XML 파싱
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'text/xml');
      const textElements = doc.querySelectorAll('text');
      
      const segments: Array<{ start: number; text: string }> = [];
      
      textElements.forEach(el => {
        const start = parseFloat(el.getAttribute('start') || '0');
        const text = el.textContent?.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/\n/g, ' ')
          .trim() || '';
        
        if (text) {
          segments.push({ start, text });
        }
      });

      const transcript = segments.map(s => `[${this.formatTime(s.start)}] ${s.text}`).join('\n');
      return { transcript, segments };
    } catch (error) {
      console.error('[Video Summarizer] Player Response 파싱 실패:', error);
      return { transcript: '', segments: [] };
    }
  }

  /**
   * 비디오 프레임(사진) 캡처
   * CORS 문제로 인해 YouTube 등 외부 비디오는 캡처가 제한될 수 있음
   * 이 경우 chrome.tabs.captureVisibleTab API를 사용하여 화면 캡처로 대체
   */
  private async captureVideoFrames(options: {
    videoSelector?: string;
    intervalSeconds?: number;
    maxFrames?: number;
  }): Promise<{ frames: Array<{ timestamp: number; imageBase64: string; width: number; height: number }>; duration: number }> {
    const { intervalSeconds = 30, maxFrames = 10 } = options;

    // 비디오 엘리먼트 찾기
    let video: HTMLVideoElement | null = null;
    
    if (options.videoSelector) {
      video = document.querySelector(options.videoSelector);
    }
    
    if (!video) {
      // YouTube 비디오
      video = document.querySelector('video.html5-main-video, video.video-stream');
    }
    
    if (!video) {
      // 일반 비디오
      video = document.querySelector('video');
    }

    if (!video) {
      throw new Error('비디오 엘리먼트를 찾을 수 없습니다');
    }

    // 비디오가 로드되었는지 확인
    if (video.readyState < 2) {
      // 비디오가 아직 로드되지 않았으면 기다림
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('비디오 로드 시간 초과')), 10000);
        video!.addEventListener('loadeddata', () => {
          clearTimeout(timeout);
          resolve();
        }, { once: true });
      });
    }

    const duration = video.duration;
    if (!duration || isNaN(duration)) {
      throw new Error('비디오 길이를 가져올 수 없습니다');
    }

    // 현재 재생 위치 저장
    const originalTime = video.currentTime;
    const wasPlaying = !video.paused;
    
    if (wasPlaying) {
      video.pause();
    }

    // 캡처할 시간 포인트 계산
    const capturePoints: number[] = [];
    const totalFrames = Math.min(maxFrames, Math.ceil(duration / intervalSeconds));
    
    for (let i = 0; i < totalFrames; i++) {
      const time = ((i + 0.5) * duration) / totalFrames;
      capturePoints.push(time);
    }

    const frames: Array<{ timestamp: number; imageBase64: string; width: number; height: number }> = [];

    // 먼저 Canvas 방식 시도
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // Canvas 방식으로 캡처 시도
      for (const time of capturePoints) {
        try {
          const frame = await this.captureFrameAtTime(video, canvas, ctx, time);
          if (frame) {
            frames.push(frame);
          }
        } catch {
          console.log(`[Video Summarizer] Canvas 캡처 실패 (${time}s), 화면 캡처로 전환`);
          break; // CORS 에러 발생 시 화면 캡처로 전환
        }
      }
    }

    // Canvas 캡처가 실패했으면 화면 캡처 방식 사용
    if (frames.length === 0) {
      console.log('[Video Summarizer] 화면 캡처 방식으로 전환');
      
      for (const time of capturePoints) {
        try {
          // 비디오를 해당 시간으로 이동
          await this.seekToTime(video, time);
          
          // 잠시 대기 (렌더링 시간)
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Background script를 통해 화면 캡처 요청
          const response = await chrome.runtime.sendMessage({
            type: 'CAPTURE_SCREEN'
          });
          
          if (response?.imageData) {
            // 비디오 영역만 크롭 (간단히 전체 화면 사용)
            frames.push({
              timestamp: time,
              imageBase64: response.imageData.split(',')[1] || response.imageData,
              width: 1280,
              height: 720
            });
          }
        } catch (error) {
          console.error(`[Video Summarizer] 화면 캡처 실패 (${time}s):`, error);
        }
      }
    }

    // 원래 위치로 복원
    video.currentTime = originalTime;
    if (wasPlaying) {
      video.play().catch(() => {});
    }

    console.log(`[Video Summarizer] ${frames.length}개 사진 캡처 완료`);
    return { frames, duration };
  }

  /**
   * 비디오를 특정 시간으로 이동
   */
  private seekToTime(video: HTMLVideoElement, time: number): Promise<void> {
    return new Promise((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked);
      video.currentTime = time;
      
      // 타임아웃
      setTimeout(() => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      }, 3000);
    });
  }

  /**
   * 특정 시간에서 프레임 캡처 (Canvas 방식)
   */
  private captureFrameAtTime(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    time: number
  ): Promise<{ timestamp: number; imageBase64: string; width: number; height: number } | null> {
    return new Promise((resolve, reject) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        
        try {
          // 비디오 크기에 맞게 캔버스 조정 (최대 512px - 비용 절감)
          const scale = Math.min(1, 512 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.floor(video.videoWidth * scale);
          canvas.height = Math.floor(video.videoHeight * scale);
          
          // 프레임 그리기
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Base64로 변환 (JPEG, 품질 0.7)
          // CORS 에러는 여기서 발생 (toDataURL 호출 시)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          const base64 = dataUrl.split(',')[1];
          
          resolve({
            timestamp: time,
            imageBase64: base64,
            width: canvas.width,
            height: canvas.height
          });
        } catch (error) {
          // CORS 에러 등 발생
          reject(error);
        }
      };

      video.addEventListener('seeked', onSeeked);
      video.currentTime = time;
      
      // 타임아웃 (5초)
      setTimeout(() => {
        video.removeEventListener('seeked', onSeeked);
        resolve(null);
      }, 5000);
    });
  }

  /**
   * 초를 MM:SS 형식으로 변환
   */
  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * 감지된 비디오 목록 반환
   */
  getDetectedVideos(): VideoInfo[] {
    return this.detectedVideos;
  }
}

// Content Script 인스턴스 생성
new ContentScript();
