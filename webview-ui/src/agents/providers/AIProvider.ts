export interface GenerationOptions {
  systemInstruction?: string;
  temperature?: number;
  jsonMode?: boolean;
}

export interface AIProvider {
  readonly name: string;
  generateText(prompt: string, options?: GenerationOptions): Promise<string>;
  generateStructured<T>(prompt: string, schemaDescription: string, options?: GenerationOptions): Promise<T>;
}
