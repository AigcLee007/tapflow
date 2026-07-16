/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_VIDEO_COMPOSER_V2?: string;
}

declare module '*.png' {
    const value: string;
    export default value;
}
