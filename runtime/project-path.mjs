export function safeProjectId(project) {
  return String(project.id || project.meta?.title || 'project').replace(/[^a-zA-Z0-9_.-]+/g,'-').replace(/^\.+/,'').slice(0,80) || 'project';
}
