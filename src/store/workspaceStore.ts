/**
 * Lightweight workspace state using React context + useReducer.
 * Replaces the need for Zustand for in-session state sharing
 * between Viewport3D, FeatureTree, PropertiesPanel, and TouchpointPanel.
 */
import { createContext, useContext, useReducer, useCallback } from 'react';
import type { ApiTouchpoint, ApiStudy, Machine, CostEstimate, ShoppingListItem, InventoryItem } from '../lib/api';
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

export interface AssemblyComponent {
  id: string;
  fixture_id: string;
  project_id: string;
  name: string;
  component_type: 'base' | 'clamp' | 'pin' | 'spacer' | 'bracket' | 'bushing' | 'custom';
  description: string;
  gltf_url: string | null;
  position_json: { x: number; y: number; z: number } | null;
  rotation_json: { x: number; y: number; z: number } | null;
  material: string;
  created_at: string;
}

interface WorkspaceState {
  projectId: string | null;
  selectedFeature: SelectedFeature | null;
  features: PartFeatures | null;
  touchpoints: ApiTouchpoint[];
  gltfUrl: string | null;
  generationProgress: { status: string; message: string; progress: number } | null;
  touchpointMode: boolean;
  // Study state
  studies: ApiStudy[];
  activeStudy: ApiStudy | null;
  studiesLoading: boolean;
  // Manufacturing state
  machines: Machine[];
  costEstimate: CostEstimate | null;
  shoppingList: ShoppingListItem[];
  inventory: InventoryItem[];
  // Assembly state
  assemblyComponents: AssemblyComponent[];
  hoveredComponentId: string | null;
}

type Action =
  | { type: 'SET_PROJECT'; projectId: string }
  | { type: 'SELECT_FEATURE'; feature: SelectedFeature | null }
  | { type: 'SET_FEATURES'; features: PartFeatures }
  | { type: 'SET_TOUCHPOINTS'; touchpoints: ApiTouchpoint[] }
  | { type: 'ADD_TOUCHPOINT'; tp: ApiTouchpoint }
  | { type: 'REMOVE_TOUCHPOINT'; id: string }
  | { type: 'SET_GLTF_URL'; url: string | null }
  | { type: 'SET_GEN_PROGRESS'; payload: WorkspaceState['generationProgress'] }
  | { type: 'SET_TOUCHPOINT_MODE'; active: boolean }
  // Study actions
  | { type: 'SET_STUDIES'; studies: ApiStudy[] }
  | { type: 'ADD_STUDY'; study: ApiStudy }
  | { type: 'SET_ACTIVE_STUDY'; study: ApiStudy | null }
  | { type: 'SET_STUDIES_LOADING'; loading: boolean }
  // Manufacturing actions
  | { type: 'SET_MACHINES'; machines: Machine[] }
  | { type: 'SET_COST_ESTIMATE'; estimate: CostEstimate | null }
  | { type: 'SET_SHOPPING_LIST'; items: ShoppingListItem[] }
  | { type: 'SET_INVENTORY'; items: InventoryItem[] }
  // Assembly actions
  | { type: 'SET_ASSEMBLY_COMPONENTS'; components: AssemblyComponent[] }
  | { type: 'SET_HOVERED_COMPONENT'; id: string | null };

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
    case 'SET_GEN_PROGRESS':
      return { ...state, generationProgress: action.payload };
    case 'SET_TOUCHPOINT_MODE':
      return { ...state, touchpointMode: action.active };
    // Study cases
    case 'SET_STUDIES':
      return { ...state, studies: action.studies };
    case 'ADD_STUDY':
      return { ...state, studies: [action.study, ...state.studies] };
    case 'SET_ACTIVE_STUDY':
      return { ...state, activeStudy: action.study };
    case 'SET_STUDIES_LOADING':
      return { ...state, studiesLoading: action.loading };
    // Manufacturing cases
    case 'SET_MACHINES':
      return { ...state, machines: action.machines };
    case 'SET_COST_ESTIMATE':
      return { ...state, costEstimate: action.estimate };
    case 'SET_SHOPPING_LIST':
      return { ...state, shoppingList: action.items };
    case 'SET_INVENTORY':
      return { ...state, inventory: action.items };
    // Assembly cases
    case 'SET_ASSEMBLY_COMPONENTS':
      return { ...state, assemblyComponents: action.components };
    case 'SET_HOVERED_COMPONENT':
      return { ...state, hoveredComponentId: action.id };
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
  generationProgress: null,
  touchpointMode: false,
  studies: [],
  activeStudy: null,
  studiesLoading: false,
  machines: [],
  costEstimate: null,
  shoppingList: [],
  inventory: [],
  assemblyComponents: [],
  hoveredComponentId: null,
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
export type { ApiTouchpoint, ApiStudy, Machine, CostEstimate, ShoppingListItem, InventoryItem } from '../lib/api';
export type { PartFeatures } from '../types';
