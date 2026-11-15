import { boot } from './loader';

// document.currentScript is only set while this file first runs.
void boot(document.currentScript as HTMLScriptElement | null);
