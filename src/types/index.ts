// 비디오 플랫폼 타입
export type VideoPlatform = 'youtube' | 'vimeo' | 'html5' | 'stream' | 'unknown';

// 스트림 타입 (네트워크 감지용)
export type StreamType = 'mp4' | 'webm' | 'hls' | 'dash' | 'flv' | 'unknown';

// 감지된 스트림 정보
export interface DetectedStream {
  url: string;
  type: StreamType;
  size?: number;
  quality?: string;
  contentType?: string;
  timestamp: number;
}

// 비디오 정보 인터페이스
export interface VideoInfo {
  platform: VideoPlatform;
  videoId?: string;
  title?: string;
  duration?: number;
  url: string;
  thumbnailUrl?: string;
  streams?: DetectedStream[]; // 감지된 스트림 목록
  sourceUrl?: string; // 비디오 소스 URL
}

// 요약 결과 인터페이스
export interface SummaryResult {
  summary: string;
  tableOfContents: TableOfContentsItem[];
  keywords: string[];
  timestamp: number;
}

// 목차 항목
export interface TableOfContentsItem {
  title: string;
  timestamp?: string; // "00:00" 형식
  description?: string;
}

// 메시지 타입 (Content Script ↔ Background ↔ Popup 통신)
export type MessageType = 
  | 'GET_VIDEO_INFO'
  | 'VIDEO_INFO_RESPONSE'
  | 'REQUEST_SUMMARY'
  | 'SUMMARY_RESPONSE'
  | 'VIDEO_DETECTED'
  | 'STREAM_DETECTED'
  | 'GET_STREAMS'
  | 'STREAMS_RESPONSE'
  | 'GET_YOUTUBE_TRANSCRIPT'
  | 'YOUTUBE_TRANSCRIPT_RESPONSE'
  | 'CAPTURE_VIDEO_FRAMES'
  | 'CAPTURE_FRAMES_RESPONSE'
  | 'CAPTURE_SCREEN'
  | 'ERROR';

export interface Message {
  type: MessageType;
  payload?: VideoInfo | VideoInfo[] | SummaryResult | DetectedStream[] | string | null;
  tabId?: number;
}

// 확장 프로그램 상태
export interface ExtensionState {
  isLoading: boolean;
  videoInfo: VideoInfo | null;
  summary: SummaryResult | null;
  error: string | null;
}

