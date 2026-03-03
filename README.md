# liuyao-coin-web

English / 中文：This README is bilingual. Search for `ENGLISH` / `中文` headings.

---

## ENGLISH

A React + TypeScript web app for **Liuyao (I Ching) coin tossing**.

### Features

- Center UI: 3 coins
- Toss by **hand gesture** (open palm -> closed fist) using MediaPipe Hands
- Manual Toss fallback
- Toss 6 times to build the main hexagram + changed hexagram (moving lines)
- Input: user question
- Generate interpretation using an **OpenAI-compatible** LLM API
- Hexagram texts are loaded from `public/config.json` (you can fill them later)

### Setup

```bash
npm i
npm run dev
```

### Configuration

Edit `public/config.json`:

```json
{
  "llm": {
    "baseUrl": "https://api.openai.com",
    "apiKey": "",
    "model": "gpt-4o-mini"
  },
  "prompts": {
    "system": "...",
    "userSuffix": ""
  },
  "vision": {
    "wasmBaseUrl": "/mediapipe-wasm/",
    "modelAssetUrl": "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
  },
  "hexagrams": {}
}
```

You can customize prompts via `prompts.system` and `prompts.userSuffix` without changing code.
Gesture assets can be overridden in `vision.*` or by env vars:
- `VITE_GESTURE_WASM_BASE_URL`
- `VITE_GESTURE_MODEL_ASSET_URL`

`npm i` will run a postinstall step that copies local wasm files to `public/mediapipe-wasm/`.

The client will call:
- `POST {baseUrl}/v1/chat/completions`
- with header: `Authorization: Bearer {apiKey}`

> Do not commit secrets. Keep apiKey empty by default.

### Build

```bash
npm run build
npm run preview
```

---

## 中文

一个 React + TypeScript 的六爻起卦网页：

### 功能

- 页面中心三枚铜钱
- 支持 **手势触发投掷**（张开手掌 -> 握拳）
- 支持手动按钮投掷（兜底）
- 连续投掷 6 次得到主卦 + 变卦（动爻翻转）
- 输入“所问何事”
- 根据卦象 + 用户问题调用 **OpenAI 兼容接口**生成解读
- 卦象文本从 `public/config.json` 读取（你后续可自行补全 64 卦内容）

### 安装运行

```bash
npm i
npm run dev
```

### 配置

编辑 `public/config.json`：

- `llm.baseUrl`：比如 `https://api.openai.com`
- `llm.apiKey`：你的 key（默认留空，不提交到 git）
- `llm.model`：模型名
- `vision.wasmBaseUrl`：MediaPipe wasm 基础路径（建议 `/mediapipe-wasm/`，注意结尾 `/`）
- `vision.modelAssetUrl`：手部模型地址（建议 `https://...`）

调用路径：`{baseUrl}/v1/chat/completions`

你也可以在 `prompts.system / prompts.userSuffix` 里自定义系统提示词与附加要求（无需改代码）。
你也可以用环境变量覆盖手势资源地址：`VITE_GESTURE_WASM_BASE_URL`、`VITE_GESTURE_MODEL_ASSET_URL`。
`npm i` 后会自动把本地 wasm 复制到 `public/mediapipe-wasm/`。

### 构建

```bash
npm run build
npm run preview
```


---

## Notes / 说明

- `public/config.json` 已预置了少量卦象占位文本（方便你马上体验）。你可以后续补全 64 卦内容。
- `public/yao_texts.json` 提供了 6/7/8/9 四种爻值的简要释义（你可自行扩写）。
