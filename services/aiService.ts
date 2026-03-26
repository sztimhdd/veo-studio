/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI } from '@google/genai';

/**
 * AIService is the single source of truth for the GoogleGenAI client.
 * All services MUST use this singleton to ensure the API key is
 * always resolved correctly from the build-time environment.
 *
 * Key resolution order (for browser environments):
 *  1. AI Studio key (for AI Studio embedding context)
 *  2. import.meta.env.VITE_GEMINI_API_KEY (Vite-inlined at build time)
 *  3. process.env.GEMINI_API_KEY (defined-block alias in vite.config.ts)
 *  4. process.env.API_KEY (legacy alias)
 */
class AIService {
  private _client: GoogleGenAI | null = null;

  /**
   * Returns the GoogleGenAI client, initializing lazily on first access.
   * Throws a clear error if no API key is found so pipelines fail fast.
   */
  get client(): GoogleGenAI {
    if (this._client) return this._client;

    const apiKey =
      (typeof window !== 'undefined' && (window as any).aistudio?.getSelectedApiKey()) ||
      import.meta.env.VITE_GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.API_KEY;

    if (!apiKey) {
      const errorMsg =
        '[AIService] CRITICAL: No API key found. ' +
        'Ensure GEMINI_API_KEY is set in GitHub Secrets and the Docker build ' +
        'receives it via --build-arg. ' +
        'Checked: import.meta.env.VITE_GEMINI_API_KEY, process.env.GEMINI_API_KEY, process.env.API_KEY';
      console.error(errorMsg);
      throw new Error('An API Key must be configured. ' + errorMsg);
    }

    console.log('[AIService] Initializing GoogleGenAI SDK...');
    this._client = new GoogleGenAI({ apiKey });
    return this._client;
  }
}

export const aiService = new AIService();
