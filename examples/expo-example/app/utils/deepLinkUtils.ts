/**
 * Parse a deep link URL and extract hostname and query parameters
 */
export function parseURL(url: string): { hostname: string; queryParams: Record<string, string> } {
  try {
    const parsed = new URL(url);
    
    // Extract hostname - handle both standard URLs and Expo URLs
    // For Expo URLs like exp://192.168.1.5:8081/--/reset_state
    // we want the path segment after /--/ or the last path segment
    let hostname = '';
    
    if (parsed.pathname.includes('/--/')) {
      // Expo dev URL format
      const parts = parsed.pathname.split('/--/');
      hostname = parts[1]?.split('/')[0] || parts[1] || '';
    } else {
      // Standard URL format - get first path segment
      hostname = parsed.pathname.split('/').filter(Boolean)[0] || '';
    }
    
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
