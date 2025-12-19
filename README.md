# Video Summarizer Chrome Extension

YouTube 및 웹 비디오를 AI로 분석하여 요약, 목차, Q&A를 제공하는 Chrome Extension입니다.

## 기능

- 🎥 **비디오 감지**: YouTube 및 웹페이지의 비디오 자동 감지
- 📝 **AI 요약**: OpenAI Whisper + Gemini를 활용한 비디오 분석
- 📑 **목차 생성**: 타임스탬프 기반 인터랙티브 목차
- 💬 **Q&A**: 비디오 내용 기반 질의응답
- 🔍 **인터넷 검색**: Tavily를 통한 외부 정보 검색 (선택)

## 설정

### 1. 환경 변수 설정

`.env` 파일을 생성하고 다음 내용을 입력하세요:

```env
OPENAI_API_KEY=your-openai-key-here
GEMINI_API_KEY=your-gemini-key-here
BACKEND_API_URL=https://video-summarizer-chrome-extension-backend.onrender.com
```

**API 키 발급:**
- OpenAI: https://platform.openai.com/api-keys
- Gemini: https://makersuite.google.com/app/apikey
- 백엔드 URL: Render에 배포된 서비스 URL

### 2. 빌드

```bash
npm install
npm run build
```

### 3. Chrome Extension 설치

1. Chrome에서 `chrome://extensions/` 접속
2. "개발자 모드" 활성화
3. "압축해제된 확장 프로그램을 로드합니다" 클릭
4. `dist` 폴더 선택

## 개발

```bash
npm run dev
```

## 주의사항

- `.env` 파일은 `.gitignore`에 포함되어 있어 GitHub에 올라가지 않습니다
- 실제 API 키는 절대 GitHub에 커밋하지 마세요
- `env.example` 파일을 참고하여 설정하세요

---

## 기술 스택

- React + TypeScript + Vite
- Chrome Extension Manifest V3
- OpenAI Whisper API
- Google Gemini API
- Flask Backend (Render 배포)

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is currently not compatible with SWC. See [this issue](https://github.com/vitejs/vite-plugin-react/issues/428) for tracking the progress.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
