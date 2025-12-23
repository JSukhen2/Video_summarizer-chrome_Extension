/**
 * AI API 서비스 모듈
 * OpenAI + Gemini 지원
 * 비디오 분석 알고리즘 구현
 */

// API 설정
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
// Gemini는 백엔드에서 직접 호출하므로 프론트엔드에서는 미사용

// 빌드 시 .env의 API 키들이 주입됨
declare const __OPENAI_API_KEY__: string;
declare const __GEMINI_API_KEY__: string;
declare const __BACKEND_API_URL__: string;

// API 키 가져오기
export const getApiKey = (): string => {
  return __OPENAI_API_KEY__ || '';
};

export const getGeminiApiKey = (): string => {
  return __GEMINI_API_KEY__ || '';
};

// Gemini API 키가 있는지 확인
export const hasGeminiKey = (): boolean => {
  return !!__GEMINI_API_KEY__;
};

// 백엔드 API URL 가져오기 (끝의 슬래시 제거)
export const getBackendApiUrl = (): string => {
  const url = __BACKEND_API_URL__ || 'http://localhost:5000';
  return url.replace(/\/+$/, ''); // 끝에 있는 슬래시 제거
};

// 타입 정의
export interface VideoTranscript {
  videoId: string;
  title: string;
  platform: string;
  duration?: number;
  transcript: string;
  language?: string;
}

export interface VideoSummaryJSON {
  videoId: string;
  title: string;
  overview: string;
  mainTopics: string[];
  keyPoints: Array<{
    content: string;
  }>;
  rawTranscript: string;
}

export interface TableOfContentsItem {
  title: string;
  description: string;
  summary: string; // 해당 섹션의 상세 요약
  keyPoints: string[]; // 핵심 포인트들
  timestampSeconds?: number; // 타임스탬프 (초 단위)
}

// 주요 프레임 (다이어그램, 슬라이드 등)
export interface KeyFrame {
  timestamp: string;          // "00:30" 형식
  timestampSeconds: number;   // 초 단위
  description: string;        // 프레임 설명
  type: 'diagram' | 'chart' | 'slide' | 'code' | 'screenshot' | 'scene';
  relatedSection?: string;    // 관련 섹션 제목
  imageBase64?: string;       // Base64 인코딩된 이미지
  width?: number;
  height?: number;
}

export interface VideoAnalysis {
  videoId: string;
  title: string;
  duration?: number;
  summary: string;
  tableOfContents: TableOfContentsItem[];
  keywords: string[];
  keyInsights: string[];
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  category?: string;
  keyFrames?: KeyFrame[];     // 주요 프레임들 (다이어그램, 슬라이드 등)
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatResponse {
  answer: string;
  relatedTopics?: string[];
}

// 비디오 프레임 캡처 데이터
export interface VideoFrame {
  timestamp: number;      // 초 단위
  imageBase64: string;    // base64 인코딩된 이미지
  width: number;
  height: number;
}

// 멀티모달 분석 입력
export interface MultimodalAnalysisInput {
  videoId: string;
  title: string;
  duration: number;
  frames: VideoFrame[];   // 캡처된 프레임들
  transcript?: string;    // 음성 인식 결과 (있으면)
}

/**
 * GPT-4o Vision API 호출 (이미지 분석용)
 */
async function callOpenAIVision(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  images: Array<{ base64: string; timestamp: number }>,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<string> {
  const { 
    model = 'gpt-4o', // Vision은 gpt-4o 사용
    temperature = 0.2,
    maxTokens = 4000
  } = options;

  // 이미지를 포함한 content 구성
  const userContent: Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }> = [
    { type: 'text', text: userPrompt }
  ];

  // 이미지 추가 (최대 10장)
  const selectedImages = images.slice(0, 10);
  selectedImages.forEach(img => {
    userContent.push({
      type: 'image_url',
      image_url: {
        url: `data:image/jpeg;base64,${img.base64}`,
        detail: 'low' // 비용 절감을 위해 low detail 사용
      }
    });
  });

  const requestBody = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    temperature,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' }
  };

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'OpenAI Vision API 호출 실패');
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

/**
 * OpenAI API 호출 헬퍼
 * - gpt-4o: 고품질 분석, 복잡한 추론 (비용 높음)
 * - gpt-4o-mini: 빠른 응답, 일반적인 분석 (비용 효율적)
 */
async function callOpenAI(
  apiKey: string,
  messages: ChatMessage[],
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: 'text' | 'json_object';
  } = {}
): Promise<string> {
  const { 
    model = 'gpt-4o-mini', 
    temperature = 0.3, // 분석 작업에는 낮은 temperature가 더 일관된 결과
    maxTokens = 2000,
    responseFormat = 'text'
  } = options;

  const requestBody: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens
  };

  // JSON 응답 형식 요청 (gpt-4o, gpt-4o-mini 지원)
  if (responseFormat === 'json_object') {
    requestBody.response_format = { type: 'json_object' };
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'OpenAI API 호출 실패');
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

/**
 * 음성 텍스트(자막) 정제 - 불필요한 내용 제거 및 정리
 */
async function refineTranscript(
  apiKey: string,
  rawTranscript: string,
  title: string
): Promise<string> {
  if (!rawTranscript || rawTranscript.length < 100) {
    return rawTranscript;
  }

  const systemPrompt = `당신은 텍스트 정제 전문가입니다. 음성 인식으로 변환된 자막 텍스트를 정리합니다.

## 정제 원칙
1. **타임스탬프 제거**: [00:00], (1:23) 등 시간 표시 모두 제거
2. **중복 제거**: 반복되는 문장이나 단어 정리
3. **무의미한 표현 제거**: "음...", "어...", "그러니까", "뭐랄까" 등 필러 워드
4. **문장 정리**: 끊어진 문장을 자연스럽게 연결
5. **핵심 내용 유지**: 실제 의미 있는 내용은 모두 보존
6. **가독성 향상**: 문단 구분, 문장 부호 정리

## 금지 사항
- 내용을 요약하거나 축약하지 마세요
- 원래 없던 내용을 추가하지 마세요
- 전문 용어나 고유명사는 그대로 유지하세요

정제된 텍스트만 출력하세요.`;

  const userPrompt = `다음 자막 텍스트를 정제해주세요.

## 콘텐츠 제목
${title}

## 원본 자막
${rawTranscript.substring(0, 12000)}

정제된 텍스트:`;

  try {
    const refined = await callOpenAI(apiKey, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { temperature: 0.1, maxTokens: 10000 });

    return refined.trim() || rawTranscript;
  } catch (error) {
    console.error('자막 정제 실패:', error);
    return rawTranscript;
  }
}

/**
 * 1단계: 비디오 제목을 바탕으로 전체 영상 내용 분석
 */
export async function step1_transcriptToJSON(
  apiKey: string,
  transcript: VideoTranscript
): Promise<VideoSummaryJSON> {
  const durationSeconds = transcript.duration || 600;
  const durationMinutes = Math.floor(durationSeconds / 60);
  const durationText = `${durationMinutes}분 ${durationSeconds % 60}초`;

  // 자막이 있으면 먼저 정제
  const hasTranscript = transcript.transcript && transcript.transcript.length > 50;
  let refinedTranscript = transcript.transcript;
  
  if (hasTranscript) {
    console.log('[Video Summarizer] 자막 정제 시작...');
    refinedTranscript = await refineTranscript(apiKey, transcript.transcript, transcript.title);
    console.log('[Video Summarizer] 자막 정제 완료:', refinedTranscript.length, '자');
  }

  const systemPrompt = `당신은 콘텐츠 분석 전문가입니다. 주어진 정보를 바탕으로 콘텐츠의 전체 구조와 핵심 내용을 분석합니다.

## 핵심 원칙
1. **내용 기반 분석**: 실제 텍스트에서 다루는 내용을 정확히 파악
2. **구조 파악**: 내용의 흐름에 따라 자연스럽게 구분되는 주제들을 찾기
3. **깊이 있는 분석**: 표면적 내용이 아닌, 실제 가치 있는 인사이트 도출
4. **유연한 구성**: 내용에 따라 섹션 개수가 달라질 수 있음 (2~10개)

## 금지 사항
- "이 영상", "해당 콘텐츠" 등 지시대명사 사용 금지
- 내용에 없는 것을 추측하여 추가하지 않기
- 반드시 유효한 JSON 형식으로만 응답`;

  const userPrompt = hasTranscript 
    ? `다음 콘텐츠의 내용을 분석하여 전체 구조와 핵심 내용을 파악해주세요.

## 콘텐츠 정보
- 제목: ${transcript.title}
- 전체 길이: ${durationText}

## 정제된 내용
${refinedTranscript.substring(0, 10000)}

## 분석 요청
1. 내용을 꼼꼼히 읽고 실제로 다루는 주제들을 파악하세요
2. 내용의 흐름에 따라 자연스럽게 구분되는 섹션들을 찾으세요
3. 각 섹션에서 다루는 구체적인 내용을 정리하세요

## 응답 형식 (JSON)
{
  "videoId": "${transcript.videoId}",
  "title": "${transcript.title}",
  "overview": "전체 내용 2-3문장 요약 (구체적인 주제와 다루는 내용 포함)",
  "mainTopics": ["실제 다루는 주제들을 나열"],
  "keyPoints": [
    {"content": "다루는 구체적 내용 1"},
    {"content": "다루는 구체적 내용 2"}
  ],
  "rawTranscript": ""
}`
    : `"${transcript.title}" 제목을 분석하여 콘텐츠 내용을 예측해주세요.

## 콘텐츠 정보
- 제목: ${transcript.title}
- 전체 길이: ${durationText}

## 제목 분석 요청
1. 제목에서 핵심 주제와 키워드를 추출하세요
2. 시리즈물인 경우 (예: "1-3", "Part 2") 해당 파트에서 다룰 내용을 예측하세요
3. 해당 주제에 대해 ${durationMinutes}분 분량으로 다룰 수 있는 내용을 구성하세요

## 응답 형식 (JSON)
{
  "videoId": "${transcript.videoId}",
  "title": "${transcript.title}",
  "overview": "예상 내용 2-3문장 요약",
  "mainTopics": ["예상되는 주요 주제들"],
  "keyPoints": [
    {"content": "예상 내용 1"},
    {"content": "예상 내용 2"}
  ],
  "rawTranscript": ""
}`;

  const response = await callOpenAI(apiKey, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], { temperature: 0.2, maxTokens: 3000, responseFormat: 'json_object' });

  // JSON 파싱
  try {
    // JSON 블록 추출
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('JSON 형식 응답을 찾을 수 없습니다');
  } catch (e) {
    console.error('JSON 파싱 실패:', e);
    // 기본 구조 반환
    return {
      videoId: transcript.videoId,
      title: transcript.title,
      overview: response.substring(0, 500),
      mainTopics: [],
      keyPoints: [],
      rawTranscript: transcript.transcript.substring(0, 1000)
    };
  }
}

/**
 * 2단계: JSON을 바탕으로 전체 영상 목차 정리 및 상세 요약
 */
export async function step2_analyzeAndStructure(
  apiKey: string,
  summaryJSON: VideoSummaryJSON,
  videoDuration?: number
): Promise<VideoAnalysis> {
  const estimatedDuration = videoDuration || 600;
  const durationMinutes = Math.floor(estimatedDuration / 60);
  const durationSeconds = estimatedDuration % 60;
  
  const systemPrompt = `당신은 콘텐츠 구조화 전문가입니다. 분석 데이터를 바탕으로 상세한 목차와 요약을 작성합니다.

## 핵심 원칙

### 1. 섹션 개수는 내용이 결정한다
- 짧은 콘텐츠: 2~3개 섹션
- 중간 콘텐츠: 3~6개 섹션  
- 긴 콘텐츠: 5~10개 섹션
- **내용의 주제 전환에 따라 자연스럽게 구분**
- 억지로 늘리거나 줄이지 않음

### 2. 제목은 구체적으로
- "도입부", "본론", "결론" 같은 추상적 제목 ❌
- 실제 다루는 내용을 명시: "마케팅의 정의와 중요성", "성공 사례 분석" ✅

### 3. 설명은 실질적으로
- "~를 소개합니다", "~를 다룹니다" 같은 뻔한 표현 ❌
- 구체적으로 어떤 내용인지 직접 서술 ✅

### 4. 핵심 포인트는 구체적으로
- 각 섹션에서 배울 수 있는 실질적인 내용
- 추상적인 표현 대신 구체적인 정보

## 금지 사항
- "이 영상", "해당 섹션", "본 콘텐츠" 등 지시대명사 절대 금지
- "첫 번째 섹션", "마지막 섹션", "다음 섹션" 등 섹션 순서 언급 금지
- "앞서", "뒤에서", "이전에", "다음에" 등 순서 참조 표현 금지
- 내용 없이 형식만 채우는 것 금지

## 출력
- 반드시 유효한 JSON 형식으로만 응답`;

  const userPrompt = `다음 분석 데이터를 바탕으로 목차와 요약을 작성해주세요.

## 1단계 분석 결과
${JSON.stringify(summaryJSON, null, 2)}

## 콘텐츠 정보
- 제목: ${summaryJSON.title}
- 전체 길이: ${durationMinutes}분 ${durationSeconds}초

## 중요 지시사항
1. 섹션 개수를 미리 정하지 마세요. 내용을 보고 자연스럽게 나뉘는 만큼만 만드세요.
2. 각 섹션의 제목과 설명은 구체적인 내용을 담아야 합니다.
3. 핵심 포인트는 실제로 배울 수 있는 구체적인 내용이어야 합니다.

## 요약 지침 [매우 중요]
- summary는 줄 수 제한 없이 내용에 맞게 충분히 상세하게 작성하세요.
- 핵심 개념, 주요 논점, 결론, 실용적 조언 등을 모두 포함하세요.
- 나중에 참조 자료로 활용할 수 있을 정도로 정밀하고 정확하게 작성하세요.
- 중요한 수치, 사례, 방법론 등 구체적인 정보를 포함하세요.

## 키워드 지침
- 각 키워드는 "키워드: 한줄 설명" 형식으로 작성하세요.
- 예: "SEO: 검색엔진 최적화로 웹사이트 노출을 높이는 마케팅 기법"

## 응답 형식 (JSON)
{
  "videoId": "${summaryJSON.videoId}",
  "title": "${summaryJSON.title}",
  "duration": ${estimatedDuration},
  "summary": "상세하고 정밀한 요약. 줄 수 제한 없이 핵심 내용, 개념, 방법론, 사례, 결론 등을 모두 포함하여 참조 자료로 활용 가능하도록 작성",
  "tableOfContents": [
    {
      "title": "구체적인 섹션 제목 (예: 마케팅의 정의와 핵심 개념)",
      "description": "이 섹션에서 다루는 구체적 내용 한 줄",
      "summary": "상세 내용. 해당 섹션의 모든 핵심 내용을 포함하여 충분히 길게 작성",
      "keyPoints": ["핵심 포인트1", "핵심 포인트2", "핵심 포인트3"]
    }
  ],
  "keywords": ["키워드1: 한줄 설명", "키워드2: 한줄 설명"],
  "keyInsights": ["실용적 인사이트들"],
  "difficulty": "beginner | intermediate | advanced",
  "category": "카테고리"
}`;

  const response = await callOpenAI(apiKey, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], { temperature: 0.2, maxTokens: 4000, responseFormat: 'json_object' });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // 목차에 기본값 추가 (AI가 생성한 개수 그대로 유지)
      if (parsed.tableOfContents && Array.isArray(parsed.tableOfContents)) {
        parsed.tableOfContents = parsed.tableOfContents.map((item: Partial<TableOfContentsItem>, i: number) => ({
          title: item.title || `섹션 ${i + 1}`,
          description: item.description || '',
          summary: item.summary || item.description || '',
          keyPoints: item.keyPoints || []
        }));
      }
      return parsed;
    }
    throw new Error('JSON 형식 응답을 찾을 수 없습니다');
  } catch (e) {
    console.error('JSON 파싱 실패:', e);
    // 폴백 응답 - keyPoints 개수에 따라 동적으로 생성
    return {
      videoId: summaryJSON.videoId,
      title: summaryJSON.title,
      duration: estimatedDuration,
      summary: summaryJSON.overview,
      tableOfContents: (summaryJSON.keyPoints || []).map((kp, i) => ({
        title: kp.content?.substring(0, 30) || `섹션 ${i + 1}`,
        description: kp.content || '',
        summary: kp.content || '',
        keyPoints: []
      })),
      keywords: summaryJSON.mainTopics || [],
      keyInsights: []
    };
  }
}

/**
 * 3단계: 질문에 답변하기 (채팅)
 */
export async function step3_chatWithVideo(
  apiKey: string,
  analysis: VideoAnalysis,
  chatHistory: ChatMessage[],
  userQuestion: string
): Promise<ChatResponse> {
  // 목차 정보를 상세하게 포맷팅 (타임스탬프 없이)
  const tocFormatted = analysis.tableOfContents.map((t, i) => 
    `[섹션 ${i + 1}] ${t.title}
    - 설명: ${t.description}
    - 상세: ${t.summary}
    - 핵심: ${t.keyPoints?.join(', ') || ''}`
  ).join('\n\n');

  const systemPrompt = `당신은 "${analysis.title}" 콘텐츠 전문 학습 어시스턴트입니다.

## 역할
- 분석 데이터를 기반으로 사용자의 질문에 정확하고 유용한 답변을 제공합니다
- 오직 분석된 콘텐츠와 관련된 주제에 대해서만 답변합니다

## 분석 데이터

### 기본 정보
- 제목: ${analysis.title}
- 길이: ${analysis.duration ? Math.floor(analysis.duration / 60) + '분' : '알 수 없음'}
- 난이도: ${analysis.difficulty || '미분류'}
- 카테고리: ${analysis.category || '미분류'}

### 전체 요약
${analysis.summary}

### 핵심 키워드
${analysis.keywords.join(', ')}

### 주요 인사이트
${analysis.keyInsights.map((insight, i) => `${i + 1}. ${insight}`).join('\n')}

### 상세 목차
${tocFormatted}

## 주제 제한 규칙 [매우 중요]
- 당신은 오직 "${analysis.title}" 콘텐츠와 관련된 질문에만 답변해야 합니다
- 콘텐츠 주제: ${analysis.category || '일반'}, 키워드: ${analysis.keywords.slice(0, 5).join(', ')}
- 위 주제와 완전히 관련 없는 질문에는 정중하게 거절하세요
- 거절 시: "죄송합니다. 저는 '${analysis.title}' 콘텐츠에 대한 질문에만 답변할 수 있습니다. 관련된 질문을 해주세요! 예를 들어 '${analysis.keywords[0] || '내용'}에 대해 자세히 설명해줘'와 같은 질문은 어떨까요?"
- 조금이라도 관련이 있으면 답변을 시도하되, 날씨/개인조언/완전 다른 주제는 거절

## 답변 원칙
1. **정확성**: 분석 데이터에 기반한 사실적 답변
2. **구체성**: 추상적 답변 대신 구체적인 내용과 예시 제공
3. **친절함**: 이해하기 쉽고 도움이 되는 방식으로 설명

## 절대 금지 표현
- "영상에서는", "이 영상", "이 비디오", "해당 영상", "본 영상" 등 절대 사용 금지
- "영상에서 다루지 않는", "영상에서 언급되지 않은" 등 사용 금지
- "첫 번째 섹션", "마지막 섹션", "다음 섹션", "이전 섹션" 등 섹션 순서 언급 금지
- "섹션 N 참고", "N번 섹션" 등 섹션 번호 참조 금지
- "앞서 언급한", "뒤에서 설명한", "다음에 나오는" 등 순서 참조 금지
- 대신 해당 내용을 직접 설명하세요

## 답변 스타일
- 자연스러운 대화체로 답변
- 분석된 내용 기반으로 답변하되, 주제와 관련된 추가 설명이 필요하면 일반 지식으로 보충
- 관련 내용이 있으면 해당 내용을 직접 인용하거나 요약해서 설명
- 목록이 필요하면 번호나 불릿 사용`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...chatHistory,
    { role: 'user', content: userQuestion }
  ];

  const response = await callOpenAI(apiKey, messages, {
    temperature: 0.7,
    maxTokens: 1000
  });

  // 관련 주제 추출 시도
  const relatedTopics = analysis.keywords.filter(kw => 
    userQuestion.toLowerCase().includes(kw.toLowerCase()) ||
    response.toLowerCase().includes(kw.toLowerCase())
  );

  return {
    answer: response,
    relatedTopics: relatedTopics.length > 0 ? relatedTopics : undefined
  };
}

/**
 * 전체 분석 파이프라인 실행
 */
export async function analyzeVideo(
  apiKey: string,
  transcript: VideoTranscript,
  onProgress?: (step: number, message: string) => void
): Promise<VideoAnalysis> {
  // 1단계: 트랜스크립트 → JSON
  onProgress?.(1, '비디오 내용을 분석하고 있습니다...');
  const summaryJSON = await step1_transcriptToJSON(apiKey, transcript);
  
  // 2단계: JSON → 상세 분석 (비디오 길이 전달)
  onProgress?.(2, '목차와 요약을 생성하고 있습니다...');
  const analysis = await step2_analyzeAndStructure(apiKey, summaryJSON, transcript.duration);
  
  onProgress?.(3, '분석 완료!');
  return analysis;
}

/**
 * YouTube 자막 가져오기
 * Content Script를 통해 페이지에서 직접 자막을 추출
 */
export async function getYouTubeTranscript(videoId: string): Promise<{ transcript: string; segments: Array<{ start: number; text: string }> } | null> {
  try {
    // 현재 탭에서 자막 가져오기 요청
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) return null;

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'GET_YOUTUBE_TRANSCRIPT',
      videoId
    }).catch(() => null);

    if (response?.transcript) {
      return {
        transcript: response.transcript,
        segments: response.segments || []
      };
    }

    return null;
  } catch (error) {
    console.error('YouTube 자막 가져오기 실패:', error);
    return null;
  }
}

/**
 * API 키 유효성 검사
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    await callOpenAI(apiKey, [
      { role: 'user', content: 'Hi' }
    ], { maxTokens: 5 });
    return true;
  } catch {
    return false;
  }
}

/**
 * 비디오에서 프레임 캡처
 * @param videoElement HTML5 비디오 엘리먼트
 * @param intervalSeconds 캡처 간격 (초)
 * @param maxFrames 최대 프레임 수
 */
export async function captureVideoFrames(
  videoElement: HTMLVideoElement,
  intervalSeconds: number = 30,
  maxFrames: number = 10
): Promise<VideoFrame[]> {
  const frames: VideoFrame[] = [];
  const duration = videoElement.duration;
  
  if (!duration || isNaN(duration)) {
    console.error('비디오 duration을 가져올 수 없습니다');
    return frames;
  }

  // 캡처할 시간 포인트 계산
  const capturePoints: number[] = [];
  const totalFrames = Math.min(maxFrames, Math.ceil(duration / intervalSeconds));
  
  for (let i = 0; i < totalFrames; i++) {
    const time = (i * duration) / totalFrames;
    capturePoints.push(time);
  }

  // Canvas 생성
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('Canvas context를 가져올 수 없습니다');
    return frames;
  }

  // 각 시간 포인트에서 프레임 캡처
  for (const time of capturePoints) {
    try {
      const frame = await captureFrameAtTime(videoElement, canvas, ctx, time);
      if (frame) {
        frames.push(frame);
      }
    } catch (error) {
      console.error(`프레임 캡처 실패 (${time}s):`, error);
    }
  }

  return frames;
}

/**
 * 특정 시간에서 프레임 캡처
 */
function captureFrameAtTime(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  time: number
): Promise<VideoFrame | null> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      
      // 비디오 크기에 맞게 캔버스 조정 (최대 512px)
      const scale = Math.min(1, 512 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      
      // 프레임 그리기
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Base64로 변환 (JPEG, 품질 0.7)
      const base64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
      
      resolve({
        timestamp: time,
        imageBase64: base64,
        width: canvas.width,
        height: canvas.height
      });
    };

    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
    
    // 타임아웃
    setTimeout(() => {
      video.removeEventListener('seeked', onSeeked);
      resolve(null);
    }, 5000);
  });
}

/**
 * 멀티모달 분석: 프레임 + 음성 텍스트로 영상 분석
 */
export async function analyzeVideoMultimodal(
  apiKey: string,
  input: MultimodalAnalysisInput,
  onProgress?: (step: number, message: string) => void
): Promise<VideoAnalysis> {
  // 자막이 있으면 먼저 정제
  let refinedTranscript = input.transcript;
  if (input.transcript && input.transcript.length > 100) {
    onProgress?.(1, '음성 텍스트를 정제하고 있습니다...');
    refinedTranscript = await refineTranscript(apiKey, input.transcript, input.title);
  }

  onProgress?.(2, '캡처된 사진을 분석하고 있습니다...');

  const systemPrompt = `당신은 영상 콘텐츠 분석 전문가입니다.
제공된 화면 캡처 사진들과 음성 텍스트(있는 경우)를 분석하여 콘텐츠의 내용을 파악합니다.

## 분석 원칙
1. **시각적 정보 활용**: 각 사진의 화면 내용, 텍스트, 그래프, 인물 등을 파악
2. **순서 이해**: 사진 순서를 기반으로 내용의 흐름을 파악
3. **음성과 매핑**: 음성 텍스트가 있으면 화면 내용과 연결하여 이해
4. **내용 기반 구분**: 주제가 바뀌는 지점을 기준으로 섹션 구분

## 금지 사항
- "이 영상", "해당 콘텐츠" 등 지시대명사 사용 금지
- "첫 번째 섹션", "마지막 섹션", "다음 섹션" 등 섹션 순서 언급 금지
- "앞서", "뒤에서", "이전에", "다음에" 등 순서 참조 표현 금지

## 출력 형식 (JSON)
{
  "title": "분석된 콘텐츠 제목",
  "summary": "전체 내용 요약 (3-5문장, 구체적으로)",
  "tableOfContents": [
    {
      "title": "섹션 제목 (구체적으로)",
      "description": "섹션 설명",
      "summary": "상세 요약 (2-3문장)",
      "keyPoints": ["핵심 포인트1", "핵심 포인트2"]
    }
  ],
  "keywords": ["키워드1", "키워드2"],
  "keyInsights": ["주요 인사이트1", "주요 인사이트2"],
  "difficulty": "beginner|intermediate|advanced",
  "category": "카테고리"
}`;

  // 이미지와 함께 분석 요청
  const images = input.frames.map(f => ({
    base64: f.imageBase64,
    timestamp: f.timestamp
  }));

  const frameInfo = input.frames.map((_, i) => 
    `[사진 ${i + 1}]`
  ).join('\n');

  let userPrompt = `## 콘텐츠 정보
- 제목: ${input.title}
- 전체 길이: ${Math.floor(input.duration / 60)}분 ${input.duration % 60}초

## 캡처된 사진 (${input.frames.length}장)
${frameInfo}

`;

  if (refinedTranscript) {
    userPrompt += `## 음성 텍스트 (정제됨)
${refinedTranscript.substring(0, 6000)}

`;
  }

  userPrompt += `위 사진들과 음성 텍스트를 분석하여 콘텐츠 내용을 파악하고, JSON 형식으로 응답해주세요.
각 사진의 화면 내용(슬라이드, 텍스트, 그래프 등)을 파악하고, 전체적인 흐름을 정리하여 목차를 생성해주세요.`;

  try {
    const response = await callOpenAIVision(apiKey, systemPrompt, userPrompt, images, {
      model: 'gpt-4o',
      temperature: 0.2,
      maxTokens: 4000
    });

    onProgress?.(3, '분석 결과를 정리하고 있습니다...');

    const result = JSON.parse(response);
    
    // 목차에서 타임스탬프 제거하고 정리
    const cleanedToc = (result.tableOfContents || []).map((item: Partial<TableOfContentsItem>, i: number) => ({
      title: item.title || `섹션 ${i + 1}`,
      description: item.description || '',
      summary: item.summary || item.description || '',
      keyPoints: item.keyPoints || []
    }));
    
    onProgress?.(3, '분석 완료!');

    return {
      videoId: input.videoId,
      title: result.title || input.title,
      duration: input.duration,
      summary: result.summary || '',
      tableOfContents: cleanedToc,
      keywords: result.keywords || [],
      keyInsights: result.keyInsights || [],
      difficulty: result.difficulty,
      category: result.category
    };
  } catch (error) {
    console.error('멀티모달 분석 실패:', error);
    throw new Error('영상 분석에 실패했습니다. 다시 시도해주세요.');
  }
}

/**
 * 백엔드 API를 사용한 비디오 분석 (Whisper + Gemini)
 * YouTube URL을 백엔드로 전송하여 분석
 * 주요 프레임(다이어그램, 슬라이드 등) 추출 포함
 */
export async function analyzeVideoWithGemini(
  videoUrl: string,
  title: string,
  _transcript?: string, // 백엔드에서 Whisper로 자동 변환하므로 현재 미사용
  onProgress?: (step: number, message: string) => void
): Promise<VideoAnalysis> {
  const backendUrl = getBackendApiUrl();
  
  onProgress?.(1, '백엔드 서버로 비디오 전송 중...');

  try {
    // 백엔드 API 호출
    const response = await fetch(`${backendUrl}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: videoUrl
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('백엔드 API 에러:', errorData);
      throw new Error(errorData.error || `백엔드 API 호출 실패 (${response.status})`);
    }

    onProgress?.(2, 'Whisper로 음성을 텍스트로 변환 중...');

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || '분석 실패');
    }

    onProgress?.(3, 'Gemini로 비디오 분석 중...');

    // 백엔드에서 받은 분석 결과를 VideoAnalysis 형식으로 변환
    const analysis = data.analysis;
    
    // 목차 정리 (타임스탬프 포함)
    const cleanedToc = (analysis.tableOfContents || []).map((item: Partial<TableOfContentsItem> & { timestamp?: string; timestampSeconds?: number }, i: number) => ({
      title: item.title || `섹션 ${i + 1}`,
      description: item.description || '',
      summary: item.summary || item.description || '',
      keyPoints: item.keyPoints || [],
      timestampSeconds: item.timestampSeconds
    }));

    // 주요 프레임 정리 (백엔드에서 이미지 포함하여 반환)
    const keyFrames: KeyFrame[] = (data.keyFrames || []).map((kf: Partial<KeyFrame>) => ({
      timestamp: kf.timestamp || '00:00',
      timestampSeconds: kf.timestampSeconds || 0,
      description: kf.description || '',
      type: kf.type || 'scene',
      relatedSection: kf.relatedSection || '',
      imageBase64: kf.imageBase64,
      width: kf.width,
      height: kf.height
    }));

    onProgress?.(3, '분석 완료!');

    return {
      videoId: videoUrl,
      title: title, // 백엔드에서 title을 제공하지 않으므로 파라미터 사용
      duration: data.duration,
      summary: analysis.summary || '',
      tableOfContents: cleanedToc,
      keywords: analysis.keywords || [],
      keyInsights: analysis.keyInsights || [],
      difficulty: analysis.difficulty,
      category: analysis.category,
      keyFrames: keyFrames.length > 0 ? keyFrames : undefined
    };
  } catch (error) {
    console.error('백엔드 분석 실패:', error);
    throw error instanceof Error ? error : new Error('비디오 분석에 실패했습니다.');
  }
}

