'use client';

import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/components/providers';
import { useUi } from '@/state/ui';
import type { ListTicketsQuery } from './types';

export const useMe = () => {
  const api = useApi();
  return useQuery({ queryKey: ['me'], queryFn: () => api.getMe(), staleTime: Infinity });
};
export const useClients = () => {
  const api = useApi();
  return useQuery({ queryKey: ['clients'], queryFn: () => api.listClients() });
};
/** Topology for the client selected in the top bar (or all clients). */
export const useTopology = (clientOverride?: string | 'all') => {
  const api = useApi();
  const sel = useUi((s) => s.clientId);
  const cid = clientOverride ?? sel;
  return useQuery({ queryKey: ['topology', cid], queryFn: () => api.getTopology(cid === 'all' ? undefined : cid) });
};
export const useNode = (id: string | null) => {
  const api = useApi();
  return useQuery({ queryKey: ['node', id], queryFn: () => api.getNode(id!), enabled: !!id, refetchInterval: 15_000 });
};
export const useNotifications = () => {
  const api = useApi();
  return useQuery({ queryKey: ['notifications'], queryFn: () => api.listNotifications({ limit: 100 }) });
};
export const useTickets = (q: ListTicketsQuery = {}) => {
  const api = useApi();
  const sel = useUi((s) => s.clientId);
  const query = { ...q, client_id: q.client_id ?? (sel === 'all' ? undefined : sel) };
  return useQuery({ queryKey: ['tickets', query], queryFn: () => api.listTickets(query) });
};
export const useTicket = (id: string | null) => {
  const api = useApi();
  return useQuery({ queryKey: ['ticket', id], queryFn: () => api.getTicket(id!), enabled: !!id });
};
export const useChat = (id: string | null) => {
  const api = useApi();
  return useQuery({ queryKey: ['chat', id], queryFn: () => api.listChat(id!), enabled: !!id, staleTime: Infinity });
};
export const useDebrief = (ticketId: string | null) => {
  const api = useApi();
  return useQuery({ queryKey: ['debrief', ticketId], queryFn: () => api.getDebrief(ticketId!), enabled: !!ticketId, retry: false });
};
export const useScenarios = () => {
  const api = useApi();
  return useQuery({ queryKey: ['scenarios'], queryFn: () => api.listScenarios(), staleTime: Infinity });
};
export const useAlerts = () => {
  const api = useApi();
  return useQuery({ queryKey: ['alerts'], queryFn: () => api.listAlerts() });
};
export const useEvidence = (ticketId: string | null) => {
  const api = useApi();
  return useQuery({ queryKey: ['evidence', ticketId], queryFn: () => api.listEvidence(ticketId!), enabled: !!ticketId });
};
export const useScorecards = () => {
  const api = useApi();
  return useQuery({ queryKey: ['scorecards'], queryFn: () => api.getScorecards() });
};
export const useSkills = () => {
  const api = useApi();
  return useQuery({ queryKey: ['skills'], queryFn: () => api.listSkills() });
};
export const useControls = () => {
  const api = useApi();
  return useQuery({ queryKey: ['controls'], queryFn: () => api.listControlResults() });
};
export const useFlows = (edgeId: string | null) => {
  const api = useApi();
  return useQuery({ queryKey: ['flows', edgeId], queryFn: () => api.listFlows(edgeId!), enabled: !!edgeId, refetchInterval: 4000 });
};
export const useReplay = (ticketId: string | null) => {
  const api = useApi();
  return useQuery({ queryKey: ['replay', ticketId], queryFn: () => api.getReplay(ticketId!), enabled: !!ticketId });
};
export const useSettings = () => {
  const api = useApi();
  return useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings() });
};
