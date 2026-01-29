/**
 * Parse an agentLink URL and extract hostname and query parameters
 * 
 * For agentLink, we use simple top-level routes:
 * - agenteract://reset_state
 * - agenteract://reload
 * - agenteract://navigate?screen=settings
 * 
 * The URL.hostname gives us the route name directly.
 */
export function parseURL(url: string): { hostname: string; queryParams: Record<string, string> } {
  try {
    const parsed = new URL(url);
    
    // For agentLink URLs like agenteract://reset_state
    // the hostname is the route name
    const hostname = parsed.hostname || parsed.pathname.split('/').filter(Boolean)[0] || '';
    
    // Extract query parameters
    const queryParams: Record<string, string> = {};
    parsed.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });
    
    return { hostname, queryParams };
  } catch (error) {
    console.error('[deepLinkUtils] Failed to parse URL:', error);
    return { hostname: '', queryParams: {} };
  }
}
