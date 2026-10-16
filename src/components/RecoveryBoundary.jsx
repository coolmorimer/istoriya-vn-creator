import React from 'react';
import { useProjectStore } from '../store/projectStore.js';
import {saveRecoveryCopy} from '../platform/recoveryDownload.js';
import {reportEditorError} from '../platform/diagnostics.js';
import {DiagnosticsButton} from './Diagnostics.jsx';
import {ProfileStorageButton} from './ProfileStorage.jsx';

export async function exportRecovery(options={}) {
  return saveRecoveryCopy(options.project??useProjectStore.getState().project,window.istoriya,options);
}

export function RecoveryBackupButton({children='Резервная копия',project,disabled=false,onBusyChange,buttonClassName='button primary'}) {
 const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[message,setMessage]=React.useState('');
 const download=async referencesOnly=>{if(busy||disabled)return;setBusy(true);onBusyChange?.(true);setError('');setMessage('');try{const result=await exportRecovery({referencesOnly,project});setMessage(result?.canceled?'Сохранение копии отменено. Черновик не изменён.':referencesOnly?'Копия содержит локальные ссылки. Сохраните также папку ресурсов.':result?.filePath?`Копия сохранена: ${result.filePath}`:'Резервная копия подготовлена к скачиванию.');}catch(error){setError(error.message||'Не удалось подготовить резервную копию.');}finally{setBusy(false);onBusyChange?.(false);}};
 return <div className="recovery-backup"><button className={buttonClassName} disabled={busy||disabled} onClick={()=>download(false)}>{busy?'Готовим копию…':children}</button>{error&&<><p role="alert">{error}</p><button className="button secondary" disabled={busy||disabled} onClick={()=>download(true)}>Скачать копию со ссылками</button></>}{message&&<p role="status">{message}</p>}</div>;
}

export class RecoveryBoundary extends React.Component {
  state={error:null};
  static getDerivedStateFromError(error) { return {error}; }
  componentDidCatch(error,info) { reportEditorError('render',error,info?.componentStack);console.error('Ошибка редактора:',error); }
  render() {
    if(!this.state.error)return this.props.children;
    return <main className="recovery-screen" role="alert"><h1>Редактор столкнулся с ошибкой</h1><p>Не закрывайте окно, пока не сохраните резервную копию. Данные проекта остаются в памяти.</p><RecoveryBackupButton>Скачать резервную копию</RecoveryBackupButton><ProfileStorageButton/><DiagnosticsButton/><button className="button secondary" onClick={()=>this.setState({error:null})}>Повторить открытие редактора</button></main>;
  }
}
