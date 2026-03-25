/**
 * Lightweight workspace state using React context + useReducer.
 * Replaces the need for Zustand for in-session state sharing
 * between Viewport3D, FeatureTree, PropertiesPanel, and TouchpointPanel.
 */
import { createContext, useContext, useReducer, useCallback } from 'react';
import type { ApiTouchpoint } from '../lib/api';
import type { PartFeatures } from '../types';

export interface SelectedFeature {
  id: string;           // face_id or hole id
  type: 'face' | 'hole' | 'datum';
  label: string;
  area_mm2?: number;
  normal?: [number, number, number];
  centroid?: [number, number, number];
  is_planar?: boolean;
  diameter?: number;
  depth?: number;
}

interface WorkspaceState {
  projectId: string | null;
  selectedFeature: SelectedFeature | null;
  features: PartFeatures | null;
  touchpoints: ApiTouchpoint[];
  gltfUrl: string | null;
  fixtureVersion: number | null;
  generationProgress: { status: string; message: string; progress: number } | null;
  touchpointMode: boolean;
}

type Action =
  | { type: 'SET_PROJECT'; projectId: string }
  | { type: 'SELECT_FEATURE'; feature: SelectedFeature | null }
  | { type: 'SET_FEATURES'; features: PartFeatures }
  | { type: 'SET_TOUCHPOINTS'; touchpoints: ApiTouchpoint[] }
  | { type: 'ADD_TOUCHPOINT'; tp: ApiTouchpoint }
  | { type: 'REMOVE_TOUCHPOINT'; id: string }
  | { type: 'SET_GLTF_URL'; url: string | null }
  | { type: 'SET_FIXTURE'; url: string | null; version: number | null }
  | { type: 'SET_GEN_PROGRESS'; payload: WorkspaceState['generationProgress'] }
  | { type: 'SET_TOUCHPOINT_MODE'; active: boolean };

function reducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case 'SET_PROJECT':
      return { ...state, projectId: action.projectId };
    case 'SELECT_FEATURE':
      return { ...state, selectedFeature: action.feature };
    case 'SET_FEATURES':
      return { ...state, features: action.features };
    case 'SET_TOUCHPOINTS':
      return { ...state, touchpoints: action.touchpoints };
    case 'ADD_TOUCHPOINT':
      return { ...state, touchpoints: [...state.touchpoints, action.tp] };
    case 'REMOVE_TOUCHPOINT':
      return { ...state, touchpoints: state.touchpoints.filter(t => t.id !== action.id) };
    case 'SET_GLTF_URL':
      return { ...state, gltfUrl: action.url };
    case 'SET_FIXTURE':
      return { ...state, gltfUrl: action.url, fixtureVersion: action.version };
    case 'SET_GEN_PROGRESS':
      return { ...state, generationProgress: action.payload };
    case 'SET_TOUCHPOINT_MODE':
      return { ...state, touchpointMode: action.active };
    default:
      return state;
  }
}

const initialState: WorkspaceState = {
  projectId: null,
  selectedFeature: null,
  features: null,
  touchpoints: [],
  gltfUrl: null,
  fixtureVersion: null,
  generationProgress: null,
  touchpointMode: false,
};

import React from 'react';

interface WorkspaceContextValue {
  state: WorkspaceState;
  dispatch: React.Dispatch<Action>;
  selectFeature: (f: SelectedFeature | null) => void;
  setTouchpointMode: (active: boolean) => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue>({
  state: initialState,
  dispatch: () => {},
  selectFeature: () => {},
  setTouchpointMode: () => {},
});

export function WorkspaceProvider({ children, projectId }: { children: React.ReactNode; projectId?: string }) {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    projectId: projectId ?? null,
  });

  const selectFeature = useCallback((f: SelectedFeature | null) => {
    dispatch({ type: 'SELECT_FEATURE', feature: f });
  }, []);

  const setTouchpointMode = useCallback((active: boolean) => {
    dispatch({ type: 'SET_TOUCHPOINT_MODE', active });
  }, []);

  return React.createElement(
    WorkspaceContext.Provider,
    { value: { state, dispatch, selectFeature, setTouchpointMode } },
    children,
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

// Re-export types so components can import from here
export type { ApiTouchpoint } from '../lib/api';
export type { PartFeatures } from '../types';
