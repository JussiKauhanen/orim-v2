// Shared identities for the AI panel's steps and the canvas cursors.
import { PROVIDERS, modelInfo, settings } from './llm.js';

export const AGENTS = {
  eye: { color: '#a58456', name: 'Preparation', tone: 'preparation', icon: '<circle cx="12" cy="12" r="3"/><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/>' },
  analyst: { color: '#547fd1', name: 'Vision analyst', tone: 'analyst', icon: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 17.5h7M17.5 14v7"/>' },
  ruler: { color: '#388b80', name: 'Measurer', tone: 'measurer', icon: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>' },
  designer: { color: '#a870bd', name: 'Shape designer', tone: 'designer', icon: '<path d="m12 3 8 8-6 9-4-6-6-4zM10 14l4-3M4 20l6-6"/><circle cx="14" cy="10" r="1.5"/>' },
  critic: { color: '#659343', name: 'Critic', tone: 'critic', icon: '<circle cx="10.5" cy="10.5" r="7"/><path d="m20.5 20.5-5-5M7.5 10.5l2 2 4-4"/>' },
  editor: { color: '#c27d53', name: 'AI editor', tone: 'editor', icon: '<path d="m14 5 5 5M4 20l4.5-1L20 7.5a2.1 2.1 0 0 0-3-3L5.5 16zM12 20h8"/>' },
  sketch: { color: '#798da9', name: 'Quick sketch', tone: 'sketch', icon: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M8 15l3-4 3 2 3-5"/>' },
};
// Who did a step: the agent's role name, or for direct edits the model that made them.
export function stepIdentity(step) {
  const agent = AGENTS[step.agent] || AGENTS.editor;
  if (step.agent !== 'editor') return { agent, name: agent.name };
  const model = step.model || settings().roles.editor;
  const provider = Object.keys(PROVIDERS).find(p => PROVIDERS[p].models.some(m => model === m.id || model?.startsWith(m.id + '-'))) || settings().provider;
  return { agent, name: modelInfo(model).name, provider };
}
// What a step is doing, without repeating the agent's name or the user's words.
export function stepAction(step, name = stepIdentity(step).name) {
  if (/^Editing:/.test(step.title)) return step.targets?.length ? 'Editing shapes' : 'Planning the changes';
  return step.title.replace(new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*', 'i'), '').replace(/^./, c => c.toUpperCase());
}
