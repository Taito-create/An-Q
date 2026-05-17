import { useRouter as useExpoRouter } from 'expo-router';

/**
 * Compatibility wrapper for router hooks.
 * 
 * This wrapper allows for easy migration from expo-router to react-router
 * by providing a consistent API across the application.
 * 
 * Currently re-exports expo-router's useRouter, but can be switched
 * to react-router's useNavigate/useLocation in the future.
 */
export function useAppRouter() {
  const router = useExpoRouter();
  return router;
}

/**
 * Type definitions for the router API.
 * These match expo-router's router API for compatibility.
 */
export type Router = ReturnType<typeof useExpoRouter>;
