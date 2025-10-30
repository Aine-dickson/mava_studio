// Raw SVG module declarations so TypeScript understands ?raw imports
declare module '*.svg?raw' {
  const content: string;
  export default content;
}