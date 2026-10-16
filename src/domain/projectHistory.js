import {enablePatches,produceWithPatches,applyPatches,current,isDraft} from 'immer';

enablePatches();
export const HISTORY_LIMIT=50;

// Recipes use a draft; ignore accidental return values from Object.assign/push.
export function editProject(project,recipe) {
 const [next,forward,backward]=produceWithPatches(project,draft=>{recipe(draft);});
 return forward.length?{project:next,entry:{forward,backward}}:null;
}
export function replayProject(project,entry,direction) {
 return applyPatches(project,direction==='undo'?entry.backward:entry.forward);
}
export function cloneDraft(value) {
 return structuredClone(isDraft(value)?current(value):value);
}
