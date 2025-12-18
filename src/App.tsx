import { useState, useEffect, useCallback } from 'react';
import type { VideoInfo, SummaryResult, ExtensionState, DetectedStream } from './types';
import './App.css';

// 크롬 확장 환경인지 체크
const isChromeExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;

// 확장된 상태 타입
interface AppState extends ExtensionState {
  streams: DetectedStream[];
  allVideos: VideoInfo[];
  expandedIndex: number | null; // 펼쳐진 항목 인덱스
}

// 통합 비디오 아이템 타입
interface VideoItem {
  id: string;
  type: 'video' | 'stream';
  title: string;
  platform?: string;
  streamType?: string;
  quality?: string;
  size?: number;
  duration?: number;
  url: string;
  thumbnailUrl?: string;
  sourceUrl?: string;
}

function App() {
  const [state, setState] = useState<AppState>({
    isLoading: false,
    videoInfo: null,
    summary: null,
    error: null,
    streams: [],
    allVideos: [],
    expandedIndex: null
  });

  /**
   * 비디오와 스트림을 통합 목록으로 변환
   */
  const getVideoItems = useCallback((): VideoItem[] => {
    const items: VideoItem[] = [];

    // DOM에서 감지된 비디오 추가
    if (state.videoInfo) {
      items.push({
        id: `video-${state.videoInfo.videoId || state.videoInfo.url}`,
        type: 'video',
        title: state.videoInfo.title || '비디오',
        platform: state.videoInfo.platform,
        duration: state.videoInfo.duration,
        url: state.videoInfo.url,
        thumbnailUrl: state.videoInfo.thumbnailUrl,
        sourceUrl: state.videoInfo.sourceUrl
      });
    }

    // 네트워크에서 감지된 스트림 추가
    state.streams.forEach((stream, index) => {
      // 중복 체크 (이미 비디오로 추가된 URL인지)
      const isDuplicate = items.some(item => 
        item.url === stream.url || item.sourceUrl === stream.url
      );
      
      if (!isDuplicate) {
        items.push({
          id: `stream-${index}-${stream.timestamp}`,
          type: 'stream',
          title: extractTitleFromUrl(stream.url),
          streamType: stream.type,
          quality: stream.quality,
          size: stream.size,
          url: stream.url,
          thumbnailUrl: undefined
        });
      }
    });

    return items;
  }, [state.videoInfo, state.streams]);

  /**
   * URL에서 제목 추출
   */
  const extractTitleFromUrl = (url: string): string => {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      
      // 파일명 추출
      const filename = pathname.split('/').pop() || '';
      
      // 확장자 제거하고 정리
      const name = filename
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
      
      if (name && name.length > 3) {
        return name.length > 50 ? name.substring(0, 50) + '...' : name;
      }
      
      // 호스트명 사용
      return urlObj.hostname.replace('www.', '');
    } catch {
      return '스트림';
    }
  };

  /**
   * 현재 탭에서 비디오 정보 가져오기
   */
  const getVideoInfo = useCallback(async () => {
    // 개발 환경에서는 mock 데이터 사용
    if (!isChromeExtension) {
      setState(prev => ({
        ...prev,
        videoInfo: {
          platform: 'youtube',
          videoId: 'dQw4w9WgXcQ',
          title: '[개발 모드] 샘플 비디오',
          duration: 212,
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
        },
        streams: [
          { url: 'https://example.com/video1.mp4', type: 'mp4', size: 52428800, quality: '1080p', timestamp: Date.now() },
          { url: 'https://example.com/video2.webm', type: 'webm', size: 31457280, quality: '720p', timestamp: Date.now() },
          { url: 'https://example.com/master.m3u8', type: 'hls', quality: 'Auto', timestamp: Date.now() }
        ],
        error: null
      }));
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.id) {
        setState(prev => ({ ...prev, error: '탭 정보를 가져올 수 없습니다.' }));
        return;
      }

      // Content Script에서 비디오 정보 가져오기
      let videoResponse = null;
      try {
        videoResponse = await chrome.tabs.sendMessage(tab.id, {
          type: 'GET_VIDEO_INFO'
        });
      } catch {
        // Content script가 로드되지 않은 페이지
      }

      // Background에서 스트림 정보 가져오기
      const streamResponse = await chrome.runtime.sendMessage({
        type: 'GET_STREAMS',
        tabId: tab.id
      });

      setState(prev => ({ 
        ...prev, 
        videoInfo: videoResponse?.payload as VideoInfo || null,
        allVideos: videoResponse?.videos as VideoInfo[] || [],
        streams: streamResponse?.payload as DetectedStream[] || [],
        error: null 
      }));
    } catch (error) {
      console.error('Failed to get video info:', error);
    }
  }, []);

  // 2초마다 자동 새로고침
  useEffect(() => {
    getVideoInfo();
    const interval = setInterval(getVideoInfo, 2000);
    return () => clearInterval(interval);
  }, [getVideoInfo]);

  /**
   * 항목 클릭 핸들러 (펼침/접힘)
   */
  const handleItemClick = (index: number) => {
    setState(prev => ({
      ...prev,
      expandedIndex: prev.expandedIndex === index ? null : index
    }));
  };

  /**
   * 요약 요청
   */
  const requestSummary = async (videoItem: VideoItem) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    if (!isChromeExtension) {
      setTimeout(() => {
        setState(prev => ({
          ...prev,
          isLoading: false,
          summary: {
            summary: `"${videoItem.title}" 비디오의 요약입니다.\n\n개발 모드 샘플 데이터입니다.`,
            tableOfContents: [
              { title: '소개', timestamp: '00:00', description: '시작' },
              { title: '본론', timestamp: '01:30', description: '주요 내용' },
              { title: '결론', timestamp: '03:00', description: '마무리' }
            ],
            keywords: ['샘플', '테스트'],
            timestamp: Date.now()
          }
        }));
      }, 1000);
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'REQUEST_SUMMARY',
        payload: { title: videoItem.title, url: videoItem.url }
      });

      if (response?.type === 'SUMMARY_RESPONSE') {
        setState(prev => ({
          ...prev,
          isLoading: false,
          summary: response.payload as SummaryResult
        }));
      }
    } catch (error) {
      console.error('Failed to get summary:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: '요약 생성 실패'
      }));
    }
  };

  /**
   * 플랫폼/타입 아이콘
   */
  const getIcon = (item: VideoItem) => {
    if (item.type === 'video') {
      const icons: Record<string, string> = {
        youtube: '▶️',
        vimeo: '🎬',
        html5: '🎥',
        stream: '📡'
      };
      return icons[item.platform || ''] || '🎬';
    }
    const streamIcons: Record<string, string> = {
      mp4: '🎬',
      webm: '🎥',
      hls: '📡',
      dash: '📺',
      flv: '📼',
      unknown: '📹'
    };
    return streamIcons[item.streamType || 'unknown'];
  };

  /**
   * 플랫폼/타입 이름
   */
  const getTypeName = (item: VideoItem) => {
    if (item.type === 'video') {
      const names: Record<string, string> = {
        youtube: 'YouTube',
        vimeo: 'Vimeo',
        html5: 'HTML5'
      };
      return names[item.platform || ''] || 'Video';
    }
    return (item.streamType || 'unknown').toUpperCase();
  };

  /**
   * 파일 크기 포맷팅
   */
  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  /**
   * 시간 포맷팅
   */
  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const videoItems = getVideoItems();

  return (
    <div className="app">
      <header className="header">
        <h1>🎬 Video Summarizer</h1>
        <span className="video-count">
          {videoItems.length > 0 ? `${videoItems.length}개 감지됨` : '감지된 비디오 없음'}
        </span>
      </header>

      <main className="main">
        {/* 에러 표시 */}
        {state.error && (
          <div className="error-message">{state.error}</div>
        )}

        {/* 비디오 목록 */}
        {videoItems.length > 0 ? (
          <div className="video-list">
            {videoItems.map((item, index) => (
              <div key={item.id} className="video-item-wrapper">
                {/* 클릭 가능한 헤더 */}
                <div 
                  className={`video-item ${state.expandedIndex === index ? 'expanded' : ''}`}
                  onClick={() => handleItemClick(index)}
                >
                  <span className="item-icon">{getIcon(item)}</span>
                  <div className="item-info">
                    <span className="item-title">{item.title}</span>
                    <div className="item-meta">
                      <span className="item-type">{getTypeName(item)}</span>
                      {item.quality && <span className="item-quality">{item.quality}</span>}
                      {item.size && <span className="item-size">{formatSize(item.size)}</span>}
                      {item.duration && <span className="item-duration">{formatDuration(item.duration)}</span>}
                    </div>
                  </div>
                  <span className="expand-icon">{state.expandedIndex === index ? '▲' : '▼'}</span>
                </div>

                {/* 펼쳐진 상세 정보 */}
                {state.expandedIndex === index && (
                  <div className="video-detail">
                    {/* 썸네일 */}
                    {item.thumbnailUrl ? (
                      <img 
                        src={item.thumbnailUrl} 
                        alt={item.title}
                        className="detail-thumbnail"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="detail-thumbnail-placeholder">
                        <span>{getIcon(item)}</span>
                        <span>썸네일 없음</span>
                      </div>
                    )}

                    {/* 상세 정보 */}
                    <div className="detail-info">
                      <div className="detail-row">
                        <span className="detail-label">타입:</span>
                        <span className="detail-value">{getTypeName(item)}</span>
                      </div>
                      {item.quality && (
                        <div className="detail-row">
                          <span className="detail-label">품질:</span>
                          <span className="detail-value">{item.quality}</span>
                        </div>
                      )}
                      {item.size && (
                        <div className="detail-row">
                          <span className="detail-label">크기:</span>
                          <span className="detail-value">{formatSize(item.size)}</span>
                        </div>
                      )}
                      {item.duration && (
                        <div className="detail-row">
                          <span className="detail-label">길이:</span>
                          <span className="detail-value">{formatDuration(item.duration)}</span>
                        </div>
                      )}
                      <div className="detail-row">
                        <span className="detail-label">URL:</span>
                        <span className="detail-value detail-url" title={item.url}>
                          {item.url.length > 50 ? item.url.substring(0, 50) + '...' : item.url}
                        </span>
                      </div>
                    </div>

                    {/* 액션 버튼 */}
                    <div className="detail-actions">
                      <button 
                        className="action-btn summarize"
                        onClick={(e) => {
                          e.stopPropagation();
                          requestSummary(item);
                        }}
                        disabled={state.isLoading}
                      >
                        {state.isLoading ? '분석 중...' : '📝 요약하기'}
                      </button>
                      <button 
                        className="action-btn copy"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(item.url);
                        }}
                      >
                        📋 URL 복사
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="no-video">
            <div className="no-video-icon">🔍</div>
            <p>이 페이지에서 비디오를 찾을 수 없습니다.</p>
            <p className="hint">비디오가 있는 페이지에서 재생을 시작해보세요.</p>
          </div>
        )}

        {/* 요약 결과 */}
        {state.summary && (
          <div className="summary-section">
            <h3>📋 요약</h3>
            <p className="summary-text">{state.summary.summary}</p>

            <h3>📑 목차</h3>
            <ul className="toc-list">
              {state.summary.tableOfContents.map((item, index) => (
                <li key={index} className="toc-item">
                  <span className="toc-timestamp">{item.timestamp}</span>
                  <span className="toc-title">{item.title}</span>
                </li>
              ))}
            </ul>

            <h3>🏷️ 키워드</h3>
            <div className="keywords">
              {state.summary.keywords.map((keyword, index) => (
                <span key={index} className="keyword-tag">{keyword}</span>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        <button className="refresh-btn" onClick={getVideoInfo}>
          🔄 새로고침
        </button>
      </footer>
    </div>
  );
}

export default App;
