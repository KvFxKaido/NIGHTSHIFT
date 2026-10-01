// gltf-validator ships no types. The asset tests use this much of it.
declare module "gltf-validator" {
  interface ValidationReport { issues: { numErrors: number; numWarnings: number; messages: { code: string; message: string; severity: number; pointer?: string }[] } }
  const validator: { validateBytes(data: Uint8Array, options?: Record<string, unknown>): Promise<ValidationReport> };
  export default validator;
}
