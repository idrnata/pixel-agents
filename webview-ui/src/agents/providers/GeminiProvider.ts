import type { AIProvider, GenerationOptions } from './AIProvider.js';

export class GeminiProvider implements AIProvider {
  readonly name = 'Google Gemini (gemini-3.8-flash)';

  async generateText(prompt: string, options?: GenerationOptions): Promise<string> {
    const res = await fetch('/api/agents/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        systemInstruction: options?.systemInstruction,
        temperature: options?.temperature ?? 0.7,
        jsonMode: options?.jsonMode ?? false,
      }),
    });

    if (!res.ok) {
      const errData = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(errData.error || `Gemini request failed: HTTP ${res.status}`);
    }

    const data = (await res.json()) as { text: string };
    return data.text;
  }

  async generateStructured<T>(
    prompt: string,
    schemaDescription: string,
    options?: GenerationOptions,
  ): Promise<T> {
    const enrichedSystem = `${options?.systemInstruction || ''}\n\nStrict requirement: You MUST respond ONLY with valid JSON matching the following schema:\n${schemaDescription}`;
    const raw = await this.generateText(prompt, {
      ...options,
      systemInstruction: enrichedSystem,
      jsonMode: true,
    });

    try {
      // Strip markdown backticks if returned
      const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      return JSON.parse(cleaned) as T;
    } catch (err) {
      console.error('[GeminiProvider] JSON Parse error for raw text:', raw, err);
      throw new Error(`Failed to parse structured JSON from Gemini: ${String(err)}`, { cause: err });
    }
  }
}
