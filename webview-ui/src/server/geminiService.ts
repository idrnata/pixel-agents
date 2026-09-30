/**
 * Legacy bridge: Gemini execution has moved to server/src/ai.
 * This file maintains backward compatibility without importing @google/genai in webview-ui.
 */
export * from '../../../server/src/ai/index.js';
