export const AUDIO_BLOCKED='Нажмите «Далее», чтобы браузер разрешил звук.';
export const AUDIO_UNREADABLE='Не удалось воспроизвести запись. Проверьте аудиофайл.';
export function audioPlaybackMessage(error) {
 if(error?.name==='AbortError')return null; // Expected when a track is stopped/replaced.
 return error?.name==='NotAllowedError'?AUDIO_BLOCKED:AUDIO_UNREADABLE;
}
