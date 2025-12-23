import type { Message, VideoInfo, SummaryResult } from '../types';
import { streamDetector } from './streamDetector';

/**
 * Background Service Worker
 * - 확장 프로그램의 백그라운드 로직 처리
 * - 네트워크 스트림 감지
 * - AI API 연동
 */

// 현재 탭의 비디오 정보 저장 (캐싱용)
const videoInfoCache: Map<number, VideoInfo> = new Map();

/**
 * 확장 프로그램 아이콘 배지 업데이트
 */
async function updateBadge(count: number, tabId?: number) {
  const badgeText = count > 0 ? count.toString() : '';
  const badgeColor = count > 0 ? '#22c55e' : '#6b7280';

  if (tabId) {
    await chrome.action.setBadgeText({ text: badgeText, tabId });
    await chrome.action.setBadgeBackgroundColor({ color: badgeColor, tabId });
  }
}

/**
 * AI를 통한 비디오 요약 생성
 * TODO: 실제 AI API 연동 필요 (OpenAI, Claude 등)
 */
async function generateSummary(videoInfo: VideoInfo): Promise<SummaryResult> {
  console.log('[Background] Generating summary for:', videoInfo);

  // 임시 구현 - 실제로는 AI API 호출 필요
  return {
    summary: `"${videoInfo.title}" 비디오의 요약입니다.\n\n이 기능을 완성하려면 AI API 키를 설정해주세요.`,
    tableOfContents: [
      { title: '소개', timestamp: '00:00', description: '비디오 시작' },
      { title: '본론', timestamp: '05:00', description: '주요 내용' },
      { title: '결론', timestamp: '10:00', description: '마무리' }
    ],
    keywords: ['비디오', '요약', '크롬 확장'],
    timestamp: Date.now()
  };
}

/**
 * 메시지 리스너
 */
chrome.runtime.onMessage.addListener((message: Message, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) => {
  console.log('[Background] Message received:', message.type);

  switch (message.type) {
    case 'VIDEO_DETECTED':
      // Content Script에서 비디오 감지 알림
      if (sender.tab?.id) {
        videoInfoCache.set(sender.tab.id, message.payload as VideoInfo);
        const streams = streamDetector.getStreams(sender.tab.id);
        updateBadge(streams.length + 1, sender.tab.id);
      }
      sendResponse({ success: true });
      break;

    case 'GET_STREAMS': {
      // 현재 탭의 스트림 목록 요청
      const tabId = message.tabId || sender.tab?.id;
      if (tabId) {
        const streams = streamDetector.getStreams(tabId);
        sendResponse({
          type: 'STREAMS_RESPONSE',
          payload: streams
        });
      } else {
        sendResponse({
          type: 'STREAMS_RESPONSE',
          payload: []
        });
      }
      break;
    }

    case 'REQUEST_SUMMARY': {
      // 요약 요청 처리
      const videoInfo = message.payload as VideoInfo;
      generateSummary(videoInfo)
        .then(summary => {
          sendResponse({
            type: 'SUMMARY_RESPONSE',
            payload: summary
          });
        })
        .catch(err => {
          sendResponse({
            type: 'ERROR',
            payload: err.message
          });
        });
      return true; // 비동기 응답
    }

    case 'CAPTURE_SCREEN':
      // 화면 캡처 요청 (CORS 우회용)
      if (sender.tab?.id) {
        chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'jpeg', quality: 70 })
          .then(imageData => {
            sendResponse({ imageData });
          })
          .catch(err => {
            console.error('[Background] 화면 캡처 실패:', err);
            sendResponse({ error: err.message });
          });
        return true; // 비동기 응답
      }
      sendResponse({ error: '탭 정보 없음' });
      break;

    default:
      sendResponse({ type: 'ERROR', payload: 'Unknown message type' });
  }

  return true;
});

/**
 * 탭 변경 시 배지 업데이트
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const streams = streamDetector.getStreams(activeInfo.tabId);
    const cached = videoInfoCache.get(activeInfo.tabId);
    const count = streams.length + (cached ? 1 : 0);
    updateBadge(count, activeInfo.tabId);
  } catch {
    updateBadge(0, activeInfo.tabId);
  }
});

/**
 * 스트림 감지 시 배지 업데이트
 */
chrome.runtime.onMessage.addListener((message: Message) => {
  if (message.type === 'STREAM_DETECTED' && message.tabId) {
    const streams = streamDetector.getStreams(message.tabId);
    const cached = videoInfoCache.get(message.tabId);
    const count = streams.length + (cached ? 1 : 0);
    updateBadge(count, message.tabId);
  }
});

/**
 * 확장 프로그램 아이콘 클릭 시 Side Panel 열기
 */
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

/**
 * 확장 프로그램 설치/업데이트 시
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Video Summarizer] Extension installed/updated');
  console.log('[Video Summarizer] Stream detector initialized');
  
  // Side Panel 설정
  await chrome.sidePanel.setOptions({
    enabled: true
  });
  
  // Side Panel 동작 설정 - 클릭 시 열기
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

export {};
