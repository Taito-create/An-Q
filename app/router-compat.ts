import { useNavigate } from 'react-router-dom';

/**
 * Compatibility wrapper for router hooks.
 * 
 * This wrapper allows for easy migration from expo-router to react-router
 * by providing a consistent API across the application.
 * 
 * Uses react-router's useNavigate and exposes push/replace/back API
 * similar to expo-router for compatibility.
 */
export function useAppRouter() {
  const navigate = useNavigate();

  return {
    push: (to: string) => navigate(to),
    replace: (to: string) => navigate(to, { replace: true }),
    back: () => navigate(-1),
  };
}

/**
 * Type definitions for the router API.
 * These provide a minimal compatible API surface.
 */
export type Router = ReturnType<typeof useAppRouter>;
