import { useState, useEffect, useRef, useCallback } from 'react';
import type { VideoAnalysis, ChatMessage } from '../services/openai';
import { 
  getApiKey, 
  getGeminiApiKey,
  hasGeminiKey,
  analyzeVideo, 
  analyzeVideoWithGemini,
  step3_chatWithVideo,
  getYouTubeTranscript,
  type VideoTranscript 
} from '../services/openai';
import type { VideoInfo, DetectedStream } from '../types';

type Tab = 'list' | 'summary' | 'toc' | 'chat';

// 비디오 미리보기 컴포넌트
interface VideoPreviewProps {
  videoUrl?: string;  // 실제 비디오 파일 URL (mp4, webm 등)
  thumbnailUrl?: string;
  platform: string;
  isHovering: boolean;
}

function VideoPreview({ videoUrl, thumbnailUrl, platform, isHovering }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoError, setVideoError] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);
  const [posterFrame, setPosterFrame] = useState<string | null>(null);
  
  // 직접 재생 가능한 URL인지 확인 (YouTube, Vimeo 등은 직접 재생 불가)
  const isPlayableUrl = videoUrl && 
    !videoUrl.includes('youtube.com') && 
    !videoUrl.includes('youtu.be') &&
    !videoUrl.includes('vimeo.com') &&
    (videoUrl.includes('.mp4') || 
     videoUrl.includes('.webm') || 
     videoUrl.includes('.m4v') ||
     videoUrl.includes('.mov') ||
     videoUrl.includes('blob:') ||
     platform === 'stream' ||
     platform === 'html5');

  const canPlayVideo = isPlayableUrl && !videoError;
  const isPlaying = isHovering && canPlayVideo && videoLoaded;
  
  // 유효한 썸네일이 있는지 확인
  const hasValidThumbnail = thumbnailUrl && !thumbnailError;
  // 비디오 첫 프레임을 포스터로 사용할 수 있는지
  const hasPosterFrame = posterFrame && !videoError;

  // 비디오 로드 시 첫 프레임 캡처
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !canPlayVideo || posterFrame) return;

    const captureFrame = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 160;
        canvas.height = video.videoHeight || 90;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          setPosterFrame(dataUrl);
        }
      } catch {
        // CORS 등으로 캡처 실패 시 무시
      }
    };

    // 메타데이터 로드 후 첫 프레임 캡처
    if (video.readyState >= 2) {
      captureFrame();
    } else {
      video.addEventListener('loadeddata', captureFrame, { once: true });
    }
  }, [canPlayVideo, posterFrame]);

  // 비디오 재생/정지 제어
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !canPlayVideo) return;

    if (isHovering) {
      video.currentTime = 0;
      video.play().catch(() => {
        setVideoError(true);
      });
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [isHovering, canPlayVideo]);

  // 5초 후 자동 정지
  useEffect(() => {
    const video = videoRef.current;
    if (!isHovering || !video) return;
    
    const handleTimeUpdate = () => {
      if (video.currentTime >= 5) {
        video.pause();
        video.currentTime = 0;
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [isHovering]);

  // 플랫폼별 기본 아이콘
  const getPlatformIcon = () => {
    switch (platform) {
      case 'youtube': return '🔴';
      case 'vimeo': return '🔵';
      case 'html5': return '🎥';
      case 'stream': return '📡';
      default: return '🎬';
    }
  };

  // 표시 우선순위: 재생 중 비디오 > 썸네일 > 비디오 첫 프레임 > 아이콘
  const showThumbnail = !isPlaying && hasValidThumbnail;
  const showPoster = !isPlaying && !hasValidThumbnail && hasPosterFrame;
  const showIcon = !isPlaying && !hasValidThumbnail && !hasPosterFrame;

  return (
    <div className="sp-video-preview">
      {/* 썸네일 이미지 */}
      {showThumbnail && (
        <img 
          src={thumbnailUrl} 
          alt="thumbnail" 
          className="sp-video-thumbnail"
          onError={() => setThumbnailError(true)}
        />
      )}
      
      {/* 비디오 첫 프레임 (포스터) */}
      {showPoster && (
        <img 
          src={posterFrame!} 
          alt="video frame" 
          className="sp-video-thumbnail"
        />
      )}
      
      {/* 플랫폼 아이콘 (썸네일/포스터 없을 때) */}
      {showIcon && (
        <div className="sp-video-platform-icon">{getPlatformIcon()}</div>
      )}
      
      {/* 재생 가능한 비디오 (항상 로드, 호버 시 재생) */}
      {canPlayVideo && videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          muted
          playsInline
          preload="metadata"
          className={`sp-video-player ${isPlaying ? 'visible' : ''}`}
          onLoadedData={() => setVideoLoaded(true)}
          onError={() => setVideoError(true)}
        />
      )}
      
      {/* 재생 중 인디케이터 */}
      {isPlaying && (
        <div className="sp-video-playing-indicator">
          <span className="sp-play-icon">▶</span>
        </div>
      )}
      
      {/* 호버 전 재생 아이콘 오버레이 */}
      {!isPlaying && (showThumbnail || showPoster) && (
        <div className="sp-video-play-overlay">
          <span>▶</span>
        </div>
      )}
    </div>
  );
}

interface DetectedVideo {
  title: string;
  duration?: number;
  size?: number;
  url: string;           // 페이지 URL 또는 비디오 URL
  sourceUrl?: string;    // 실제 비디오 파일 URL (mp4, webm 등)
  platform: string;
  videoId?: string;
  thumbnailUrl?: string;
  quality?: string;
}

// 채팅 메시지 포맷팅 컴포넌트
function FormattedMessage({ content }: { content: string }) {
  // 인라인 포맷팅 (볼드, 타임스탬프 등)
  const formatInline = (text: string, baseKey: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let keyIndex = 0;

    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      // 섹션 참조 패턴 (예: "섹션 2 참고", "(섹션 3 참고)")
      const sectionMatch = remaining.match(/\(?섹션\s*(\d+)\s*참고\)?/);
      
      let firstMatchIndex = Infinity;
      let firstMatchLength = 0;
      let firstMatchElement: React.ReactNode = null;
      
      if (boldMatch && boldMatch.index !== undefined && boldMatch.index < firstMatchIndex) {
        firstMatchIndex = boldMatch.index;
        firstMatchLength = boldMatch[0].length;
        firstMatchElement = <strong key={`${baseKey}-b-${keyIndex++}`}>{boldMatch[1]}</strong>;
      }
      
      if (sectionMatch && sectionMatch.index !== undefined && sectionMatch.index < firstMatchIndex) {
        firstMatchIndex = sectionMatch.index;
        firstMatchLength = sectionMatch[0].length;
        firstMatchElement = <span key={`${baseKey}-s-${keyIndex++}`} className="sp-section-badge">섹션 {sectionMatch[1]}</span>;
      }
      
      if (firstMatchElement !== null && firstMatchIndex !== Infinity) {
        if (firstMatchIndex > 0) {
          parts.push(remaining.substring(0, firstMatchIndex));
        }
        parts.push(firstMatchElement);
        remaining = remaining.substring(firstMatchIndex + firstMatchLength);
      } else {
        parts.push(remaining);
        break;
      }
    }
    
    return parts;
  };

  // 마크다운 스타일 텍스트를 HTML로 변환
  const formatText = (text: string): React.ReactNode[] => {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let listItems: string[] = [];
    let listType: 'number' | 'bullet' | null = null;
    let elementKey = 0;
    
    const flushList = () => {
      if (listItems.length > 0) {
        const items = listItems.map((item, i) => (
          <li key={i}>{formatInline(item, `li-${elementKey}-${i}`)}</li>
        ));
        
        if (listType === 'number') {
          elements.push(
            <ol key={`ol-${elementKey++}`} className="sp-formatted-list">{items}</ol>
          );
        } else {
          elements.push(
            <ul key={`ul-${elementKey++}`} className="sp-formatted-list">{items}</ul>
          );
        }
        listItems = [];
        listType = null;
      }
    };

    lines.forEach((line) => {
      const trimmedLine = line.trim();
      
      // 빈 줄
      if (!trimmedLine) {
        flushList();
        return;
      }
      
      // 번호 목록 (1. 2. 3. 등)
      const numberMatch = trimmedLine.match(/^(\d+)\.\s*\*?\*?(.+?)\*?\*?:?\s*(.*)$/);
      if (numberMatch) {
        if (listType !== 'number') {
          flushList();
          listType = 'number';
        }
        const title = numberMatch[2].replace(/\*\*/g, '');
        const desc = numberMatch[3];
        listItems.push(desc ? `**${title}**: ${desc}` : title);
        return;
      }
      
      // 불릿 목록 (- * 등)
      const bulletMatch = trimmedLine.match(/^[-*•]\s*\*?\*?(.+?)\*?\*?:?\s*(.*)$/);
      if (bulletMatch) {
        if (listType !== 'bullet') {
          flushList();
          listType = 'bullet';
        }
        const title = bulletMatch[1].replace(/\*\*/g, '');
        const desc = bulletMatch[2];
        listItems.push(desc ? `**${title}**: ${desc}` : title);
        return;
      }
      
      // 일반 텍스트
      flushList();
      elements.push(
        <p key={`p-${elementKey++}`} className="sp-formatted-paragraph">
          {formatInline(trimmedLine, `p-${elementKey}`)}
        </p>
      );
    });
    
    flushList();
    return elements;
  };

  return <div className="sp-formatted-message">{formatText(content)}</div>;
}

interface AnalysisState {
  isLoading: boolean;
  progress: string;
  step: number;
  analysis: VideoAnalysis | null;
  error: string | null;
}

function SidePanel() {
  const [activeTab, setActiveTab] = useState<Tab>('list');
  const [analysisState, setAnalysisState] = useState<AnalysisState>({
    isLoading: false,
    progress: '',
    step: 0,
    analysis: null,
    error: null
  });
  
  // 탐지된 비디오 목록
  const [detectedVideos, setDetectedVideos] = useState<DetectedVideo[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<DetectedVideo | null>(null);
  
  // 새로 탐지된 비디오 개수 (목록 탭 확인 전)
  const [newVideoCount, setNewVideoCount] = useState(0);
  
  // 채팅 상태
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // 목차 펼침 상태
  const [expandedTocItems, setExpandedTocItems] = useState<Set<number>>(new Set());
  
  // 호버 중인 비디오 인덱스
  const [hoveringVideoIndex, setHoveringVideoIndex] = useState<number | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 마우스 진입 핸들러 (약간의 딜레이로 의도적 호버 감지)
  const handleMouseEnter = useCallback((index: number) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveringVideoIndex(index);
    }, 200); // 200ms 딜레이
  }, []);

  // 마우스 이탈 핸들러
  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setHoveringVideoIndex(null);
  }, []);

  // 비디오 목록 가져오기
  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab.id) return;

        // 페이지 제목 가져오기
        const pageTitle = tab.title || '비디오';

        // Content Script에서 비디오 정보 가져오기
        const videoResponse = await chrome.tabs.sendMessage(tab.id, {
          type: 'GET_VIDEO_INFO'
        }).catch(() => null);

        // Background에서 스트림 정보 가져오기
        const streamResponse = await chrome.runtime.sendMessage({
          type: 'GET_STREAMS',
          tabId: tab.id
        }).catch(() => null);

        const videos: DetectedVideo[] = [];

        // Content Script에서 감지된 비디오
        if (videoResponse) {
          // videos 배열 우선 사용 (모든 비디오 목록)
          const videoList = videoResponse.videos || (videoResponse.payload ? [videoResponse.payload] : []);
          
          if (Array.isArray(videoList)) {
            videoList.forEach((v: VideoInfo) => {
              if (v && v.url) {
                videos.push({
                  title: v.title || pageTitle,
                  duration: v.duration,
                  url: v.url,              // 페이지 URL
                  sourceUrl: v.sourceUrl,  // 실제 비디오 파일 URL
                  platform: v.platform,
                  videoId: v.videoId,
                  thumbnailUrl: v.thumbnailUrl
                });
              }
            });
          }
        }

        // 네트워크에서 감지된 스트림 - 페이지 제목 사용
        if (streamResponse?.payload && Array.isArray(streamResponse.payload)) {
          streamResponse.payload.forEach((stream: DetectedStream, index: number) => {
            // 중복 제거
            if (!videos.some(v => v.url === stream.url)) {
              // 여러 스트림이 있으면 번호 추가
              const streamTitle = streamResponse.payload.length > 1 
                ? `${pageTitle} (${index + 1})`
                : pageTitle;
              videos.push({
                title: streamTitle,
                size: stream.size,
                url: stream.url,
                platform: 'stream',
                quality: stream.quality
              });
            }
          });
        }

        setDetectedVideos(prevVideos => {
          const currentCount = videos.length;
          const prevCount = prevVideos.length;
          
          // 새로운 비디오가 추가된 경우
          if (currentCount > prevCount) {
            const newCount = currentCount - prevCount;
            // 목록 탭이 아닌 경우에만 새 비디오 카운트 증가
            if (activeTab !== 'list') {
              setNewVideoCount(prev => prev + newCount);
            }
          }
          
          return videos;
        });
        
        // 첫 번째 비디오 자동 선택
        if (videos.length > 0 && !selectedVideo) {
          setSelectedVideo(videos[0]);
        }
      } catch (error) {
        console.error('비디오 목록 가져오기 실패:', error);
      }
    };

    fetchVideos();
    const interval = setInterval(fetchVideos, 3000);
    return () => clearInterval(interval);
  }, [selectedVideo, activeTab]);

  // 채팅 스크롤
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // 용량 포맷
  const formatSize = (bytes?: number): string => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // 시간 포맷
  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '-';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 비디오 선택 및 분석
  const selectAndAnalyze = (video: DetectedVideo) => {
    setSelectedVideo(video);
    setActiveTab('summary');
    // 분석 상태 초기화
    setAnalysisState({
      isLoading: false,
      progress: '',
      step: 0,
      analysis: null,
      error: null
    });
    setChatMessages([]);
  };

  // 비디오 분석 시작 (useGemini: Gemini로 비디오 직접 분석)
  const startAnalysis = async (useGemini: boolean = false) => {
    if (!selectedVideo) {
      setAnalysisState(prev => ({ ...prev, error: '비디오를 선택해주세요.' }));
      return;
    }

    setAnalysisState({
      isLoading: true,
      progress: '분석 준비 중...',
      step: 0,
      analysis: null,
      error: null
    });

    try {
      // Gemini 비디오 분석 (비디오 URL 직접 분석)
      if (useGemini) {
        const geminiKey = getGeminiApiKey();
        if (!geminiKey) {
          throw new Error('Gemini API 키가 설정되지 않았습니다. .env 파일에 GEMINI_API_KEY를 추가해주세요.');
        }

        // 자막도 함께 가져오기 시도 (참고용)
        let transcriptText = '';
        if (selectedVideo.platform === 'youtube' && selectedVideo.videoId) {
          setAnalysisState(prev => ({ ...prev, progress: '자막을 가져오는 중...' }));
          const transcriptData = await getYouTubeTranscript(selectedVideo.videoId);
          if (transcriptData?.transcript) {
            transcriptText = transcriptData.transcript;
            console.log('[Video Summarizer] 자막 가져오기 성공:', transcriptText.length, '자');
          }
        }

        const analysis = await analyzeVideoWithGemini(
          selectedVideo.url,
          selectedVideo.title,
          transcriptText || undefined,
          (step, message) => {
            setAnalysisState(prev => ({
              ...prev,
              step,
              progress: message
            }));
          }
        );

        setAnalysisState({
          isLoading: false,
          progress: '완료!',
          step: 3,
          analysis,
          error: null
        });

        setChatMessages([{
          role: 'assistant',
          content: `안녕하세요! "${analysis.title}" 콘텐츠를 Gemini AI로 분석했습니다. 궁금한 점이 있으시면 질문해주세요.`
        }]);

        return;
      }

      // 기존 자막 기반 분석 (OpenAI)
      const apiKey = getApiKey();
      if (!apiKey) {
        setAnalysisState(prev => ({ ...prev, error: 'OpenAI API 키가 설정되지 않았습니다.' }));
        return;
      }

      // 기존 자막 기반 분석
      let transcriptText = '';
      if (selectedVideo.platform === 'youtube' && selectedVideo.videoId) {
        setAnalysisState(prev => ({ ...prev, progress: '자막을 가져오는 중...' }));
        
        const transcriptData = await getYouTubeTranscript(selectedVideo.videoId);
        if (transcriptData?.transcript) {
          transcriptText = transcriptData.transcript;
          console.log('[Video Summarizer] 자막 가져오기 성공:', transcriptText.length, '자');
        } else {
          console.log('[Video Summarizer] 자막 없음, 제목 기반 분석 진행');
        }
      }

      const transcript: VideoTranscript = {
        videoId: selectedVideo.videoId || selectedVideo.url,
        title: selectedVideo.title,
        platform: selectedVideo.platform,
        duration: selectedVideo.duration,
        transcript: transcriptText || selectedVideo.title // 자막이 있으면 자막 사용, 없으면 제목
      };

      const analysis = await analyzeVideo(
        apiKey,
        transcript,
        (step, message) => {
          setAnalysisState(prev => ({
            ...prev,
            step,
            progress: message
          }));
        }
      );

      setAnalysisState({
        isLoading: false,
        progress: '완료!',
        step: 3,
        analysis,
        error: null
      });

      setChatMessages([{
        role: 'assistant',
        content: `안녕하세요! "${analysis.title}" 비디오에 대해 궁금한 점이 있으시면 질문해주세요.`
      }]);

    } catch (error) {
      setAnalysisState({
        isLoading: false,
        progress: '',
        step: 0,
        analysis: null,
        error: error instanceof Error ? error.message : '분석 중 오류가 발생했습니다.'
      });
    }
  };

  // 채팅 메시지 전송
  const sendMessage = async () => {
    if (!inputMessage.trim() || !analysisState.analysis) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');
    
    const newMessages: ChatMessage[] = [
      ...chatMessages,
      { role: 'user', content: userMessage }
    ];
    setChatMessages(newMessages);
    setIsChatLoading(true);

    try {
      const apiKey = getApiKey();
      const response = await step3_chatWithVideo(
        apiKey,
        analysisState.analysis,
        chatMessages,
        userMessage
      );

      setChatMessages([
        ...newMessages,
        { role: 'assistant', content: response.answer }
      ]);
    } catch {
      setChatMessages([
        ...newMessages,
        { role: 'assistant', content: '죄송합니다. 응답을 생성하는 중 오류가 발생했습니다.' }
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // 목록 탭 클릭 핸들러
  const handleListTabClick = () => {
    setActiveTab('list');
    // 배지 초기화
    setNewVideoCount(0);
  };

  return (
    <div className="sidepanel">
      {/* 헤더 */}
      <header className="sp-header">
        <div className="sp-logo">
          <span className="sp-logo-icon">🎬</span>
          <span className="sp-logo-text">Video Summarizer</span>
        </div>
        {selectedVideo && (
          <div className="sp-video-title" title={selectedVideo.title}>
            {selectedVideo.title.length > 30 
              ? selectedVideo.title.substring(0, 30) + '...' 
              : selectedVideo.title}
          </div>
        )}
      </header>

      {/* 탭 네비게이션 */}
      <nav className="sp-tabs">
        <button 
          className={`sp-tab ${activeTab === 'list' ? 'active' : ''}`}
          onClick={handleListTabClick}
        >
          📹 목록 {newVideoCount > 0 && <span className="sp-tab-badge">{newVideoCount}</span>}
        </button>
        <button 
          className={`sp-tab ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
          disabled={!selectedVideo}
        >
          📋 요약
        </button>
        <button 
          className={`sp-tab ${activeTab === 'toc' ? 'active' : ''}`}
          onClick={() => setActiveTab('toc')}
          disabled={!analysisState.analysis}
        >
          📑 목차
        </button>
        <button 
          className={`sp-tab ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
          disabled={!analysisState.analysis}
        >
          💬 질문
        </button>
      </nav>

      {/* 메인 콘텐츠 */}
      <main className="sp-content">
        {/* 목록 탭 */}
        {activeTab === 'list' && (
          <div className="sp-list">
            {detectedVideos.length === 0 ? (
              <div className="sp-empty">
                <div className="sp-empty-icon">🔍</div>
                <h3>비디오를 찾는 중...</h3>
                <p>페이지에서 비디오를 탐지하고 있습니다.</p>
              </div>
            ) : (
              <>
                <div className="sp-list-header">
                  <span>탐지된 비디오 ({detectedVideos.length}개)</span>
                </div>
                <ul className="sp-video-list">
                  {detectedVideos.map((video, i) => (
                    <li 
                      key={i} 
                      className={`sp-video-item ${selectedVideo?.url === video.url ? 'selected' : ''} ${hoveringVideoIndex === i ? 'hovering' : ''}`}
                      onClick={() => selectAndAnalyze(video)}
                      onMouseEnter={() => handleMouseEnter(i)}
                      onMouseLeave={handleMouseLeave}
                    >
                      {/* 비디오 인트로 미리보기 (아이콘 대체) */}
                      <div className="sp-video-preview-wrapper">
                        <VideoPreview 
                          videoUrl={video.sourceUrl || video.url}
                          thumbnailUrl={video.thumbnailUrl}
                          platform={video.platform}
                          isHovering={hoveringVideoIndex === i}
                        />
                      </div>
                      
                      <div className="sp-video-info">
                        <div className="sp-video-details">
                          <span className="sp-video-name" title={video.title}>
                            {video.title.length > 40 ? video.title.substring(0, 40) + '...' : video.title}
                          </span>
                          <div className="sp-video-meta">
                            <span className="sp-video-duration">
                              ⏱️ {formatDuration(video.duration)}
                            </span>
                            <span className="sp-video-size">
                              💾 {formatSize(video.size)}
                            </span>
                            {video.quality && (
                              <span className="sp-video-quality">
                                📺 {video.quality}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="sp-video-action">
                        <span className="sp-analyze-icon">→</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {/* 요약 탭 */}
        {activeTab === 'summary' && (
          <div className="sp-summary">
            {/* 분석 전 상태 */}
            {!analysisState.analysis && !analysisState.isLoading && (
              <div className="sp-empty">
                {selectedVideo ? (
                  <>
                    <div className="sp-empty-icon">🎥</div>
                    <h3>비디오 분석 준비 완료</h3>
                    <p className="sp-selected-video-title">"{selectedVideo.title}"</p>
                    <div className="sp-selected-video-meta">
                      <span>⏱️ {formatDuration(selectedVideo.duration)}</span>
                      <span>💾 {formatSize(selectedVideo.size)}</span>
                    </div>
                    <div className="sp-analyze-buttons">
                      <button className="sp-analyze-btn" onClick={() => startAnalysis(false)}>
                        📝 자막 기반 분석
                      </button>
                      {hasGeminiKey() && (
                        <button className="sp-analyze-btn sp-analyze-gemini" onClick={() => startAnalysis(true)}>
                          🎬 Gemini 비디오 분석
                        </button>
                      )}
                    </div>
                    <p className="sp-analyze-hint">
                      {hasGeminiKey() 
                        ? '💡 자막 기반: 빠름 (OpenAI) | Gemini: 비디오 직접 분석'
                        : '💡 Gemini API 키를 추가하면 비디오 직접 분석 가능'}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="sp-empty-icon">📹</div>
                    <h3>비디오를 선택해주세요</h3>
                    <p>목록 탭에서 분석할 비디오를 선택하세요.</p>
                    <button className="sp-back-btn" onClick={() => setActiveTab('list')}>
                      ← 목록으로 돌아가기
                    </button>
                  </>
                )}
                {analysisState.error && (
                  <div className="sp-error">{analysisState.error}</div>
                )}
              </div>
            )}

            {/* 로딩 상태 */}
            {analysisState.isLoading && (
              <div className="sp-loading">
                <div className="sp-spinner"></div>
                <div className="sp-progress">
                  <div className="sp-progress-bar">
                    <div 
                      className="sp-progress-fill" 
                      style={{ width: `${(analysisState.step / 3) * 100}%` }}
                    ></div>
                  </div>
                  <span className="sp-progress-text">{analysisState.progress}</span>
                </div>
              </div>
            )}

            {/* 분석 결과 */}
            {analysisState.analysis && (
              <>
                <section className="sp-section">
                  <h3>📋 요약</h3>
                  <p className="sp-summary-text">{analysisState.analysis.summary}</p>
                </section>

                <section className="sp-section">
                  <h3>📑 목차 ({analysisState.analysis.tableOfContents.length}개 섹션)</h3>
                  <div className="sp-toc-preview">
                    {analysisState.analysis.tableOfContents.map((item, i) => (
                      <div 
                        key={i} 
                        className="sp-toc-preview-item"
                        onClick={() => {
                          setActiveTab('toc');
                          setExpandedTocItems(new Set([i]));
                        }}
                      >
                        <span className="sp-toc-preview-num">{i + 1}</span>
                        <span className="sp-toc-preview-title">{item.title}</span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* 주요 장면 갤러리 (이미지가 있을 때만 표시) */}
                {analysisState.analysis.keyFrames && analysisState.analysis.keyFrames.length > 0 && (
                  <section className="sp-section">
                    <h3>🖼️ 주요 장면 ({analysisState.analysis.keyFrames.length}개)</h3>
                    <div className="sp-keyframes-gallery">
                      {analysisState.analysis.keyFrames.map((kf, i) => (
                        <div key={i} className="sp-keyframe-item">
                          {kf.imageBase64 && (
                            <div className="sp-keyframe-image-container">
                              <img 
                                src={`data:image/jpeg;base64,${kf.imageBase64}`}
                                alt={kf.description}
                                className="sp-keyframe-image"
                              />
                              <span className="sp-keyframe-timestamp">{kf.timestamp}</span>
                              <span className={`sp-keyframe-type ${kf.type}`}>
                                {kf.type === 'diagram' && '📊'}
                                {kf.type === 'chart' && '📈'}
                                {kf.type === 'slide' && '📄'}
                                {kf.type === 'code' && '💻'}
                                {kf.type === 'screenshot' && '📸'}
                                {kf.type === 'scene' && '🎬'}
                              </span>
                            </div>
                          )}
                          <div className="sp-keyframe-info">
                            <p className="sp-keyframe-desc">{kf.description}</p>
                            {kf.relatedSection && (
                              <span className="sp-keyframe-section">📑 {kf.relatedSection}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section className="sp-section">
                  <h3>🏷️ 키워드</h3>
                  <div className="sp-keywords-list">
                    {analysisState.analysis.keywords.map((kw, i) => {
                      const parts = kw.split(':');
                      const keyword = parts[0].trim();
                      const description = parts.length > 1 ? parts.slice(1).join(':').trim() : null;
                      return (
                        <div key={i} className="sp-keyword-item">
                          <span className="sp-keyword-name">{keyword}</span>
                          {description && (
                            <span className="sp-keyword-desc">{description}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="sp-section">
                  <h3>💡 핵심 인사이트</h3>
                  <ul className="sp-insights">
                    {analysisState.analysis.keyInsights.map((insight, i) => (
                      <li key={i}>{insight}</li>
                    ))}
                  </ul>
                </section>

                {analysisState.analysis.category && (
                  <div className="sp-meta">
                    <span className="sp-category">{analysisState.analysis.category}</span>
                    {analysisState.analysis.difficulty && (
                      <span className={`sp-difficulty ${analysisState.analysis.difficulty}`}>
                        {analysisState.analysis.difficulty === 'beginner' && '초급'}
                        {analysisState.analysis.difficulty === 'intermediate' && '중급'}
                        {analysisState.analysis.difficulty === 'advanced' && '고급'}
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* 목차 탭 */}
        {activeTab === 'toc' && analysisState.analysis && (
          <div className="sp-toc">
            <h3>📑 목차</h3>
            <ul className="sp-toc-list">
              {analysisState.analysis.tableOfContents.map((item, i) => {
                const isExpanded = expandedTocItems.has(i);
                return (
                  <li 
                    key={i} 
                    className={`sp-toc-item ${isExpanded ? 'expanded' : ''}`}
                    onClick={() => {
                      setExpandedTocItems(prev => {
                        const next = new Set(prev);
                        if (next.has(i)) {
                          next.delete(i);
                        } else {
                          next.add(i);
                        }
                        return next;
                      });
                    }}
                  >
                    <div className="sp-toc-header">
                      <span className="sp-toc-num">{i + 1}</span>
                      <div className="sp-toc-title-row">
                        <strong>{item.title}</strong>
                        <span className={`sp-toc-arrow ${isExpanded ? 'open' : ''}`}>▼</span>
                      </div>
                      <p className="sp-toc-desc">{item.description}</p>
                    </div>
                    
                    {isExpanded && (
                      <div className="sp-toc-details">
                        {item.summary && (
                          <div className="sp-toc-summary">
                            <h4>📝 요약</h4>
                            <p>{item.summary}</p>
                          </div>
                        )}
                        {item.keyPoints && item.keyPoints.length > 0 && (
                          <div className="sp-toc-keypoints">
                            <h4>💡 핵심 포인트</h4>
                            <ul>
                              {item.keyPoints.map((point, j) => (
                                <li key={j}>{point}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* 채팅 탭 */}
        {activeTab === 'chat' && analysisState.analysis && (
          <div className="sp-chat">
            {/* 채팅 헤더 */}
            <div className="sp-chat-header">
              <span className="sp-chat-header-icon">💬</span>
              <div className="sp-chat-header-text">
                <div className="sp-chat-header-title">AI 질문 어시스턴트</div>
                <div className="sp-chat-header-subtitle">
                  "{analysisState.analysis.title}" 관련 질문만 가능합니다
                </div>
              </div>
            </div>

            <div className="sp-chat-messages">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`sp-message ${msg.role}`}>
                  <div className="sp-message-content">
                    {msg.role === 'assistant' ? (
                      <FormattedMessage content={msg.content} />
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="sp-message assistant">
                  <div className="sp-message-content sp-typing">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* 빠른 질문 제안 */}
            {chatMessages.length <= 1 && analysisState.analysis.keywords.length > 0 && (
              <div className="sp-chat-suggestions">
                {analysisState.analysis.keywords.slice(0, 3).map((keyword, i) => {
                  const keywordName = keyword.split(':')[0].trim();
                  return (
                    <button
                      key={i}
                      className="sp-suggestion-chip"
                      onClick={() => {
                        setInputMessage(`${keywordName}에 대해 자세히 설명해줘`);
                      }}
                    >
                      💡 {keywordName}란?
                    </button>
                  );
                })}
              </div>
            )}
            
            <div className="sp-chat-input">
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="콘텐츠 관련 질문을 입력하세요..."
                rows={2}
              />
              <button 
                onClick={sendMessage} 
                disabled={!inputMessage.trim() || isChatLoading}
              >
                ✈️ 전송
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default SidePanel;
