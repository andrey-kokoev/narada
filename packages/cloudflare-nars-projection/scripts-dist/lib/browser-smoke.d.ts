type AnyRecord = Record<string, any>;
type AnyPage = any;
export declare function findHeadlessBrowser(): string | null;
export declare function buildHeadlessBrowserArgs({ userDataDir, url, width, height }?: AnyRecord): string[];
export declare function openCdpPage({ browserPath, url, userDataPrefix, viewport }: AnyRecord): Promise<any>;
export declare function waitForPageText(page: AnyPage, text: string, timeoutMs: number): Promise<AnyRecord>;
export declare function waitForPageTextOccurrence(page: AnyPage, text: string, minimumCount: number, timeoutMs: number): Promise<AnyRecord>;
export declare function waitForPageTextWithAction(page: AnyPage, text: string, timeoutMs: number, action: () => Promise<any>): Promise<AnyRecord>;
export declare function sleep(ms: number): Promise<void>;
export {};
//# sourceMappingURL=browser-smoke.d.ts.map