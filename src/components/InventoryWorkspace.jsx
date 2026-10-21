import {useState} from 'react';
import {Plus,Trash,Package,ArrowSquareOut} from '@phosphor-icons/react';
import {useProjectStore} from '../store/projectStore.js';
import {logicReferences} from '../../runtime/logic-references.mjs';
import './inventory-workspace.css';
export function InventoryWorkspace(){
 const {project,addItem,updateItem,removeItem,navigateTo,selectedInventoryId:selectedId,setSelectedInventory:setSelected}=useProjectStore();
 const [search,setSearch]=useState(''),[error,setError]=useState(''),items=project.items??[],selected=items.find(i=>i.id===selectedId)??items[0];
 const uses=selected?logicReferences(project,'item',selected.id):[],images=project.resources.filter(r=>r.mime?.startsWith('image/'));
 const open=use=>{try{if(use.rpg){useProjectStore.getState().setLogicTab('rpg');return;}navigateTo({...use,projectId:project.id,kind:'scene',id:use.sceneId});setError('');}catch(err){setError(err.message);}};
 return <section className="inventory-workspace"><header><div><h2>Предметы инвентаря</h2><p>Игрок получает вещи через результаты выбора и реакции предметов. Создание записи не выдаёт её игроку.</p></div><button className="button primary" onClick={addItem}><Plus/>Новый предмет</button></header>
  {!items.length?<div className="inventory-empty"><Package size={40}/><h3>Инвентарь проекта пока пуст</h3><p>Добавьте ключ, письмо или другую вещь. Затем выберите её в реакции «Взять» или в результате выбора.</p></div>:<div className="inventory-columns"><aside><label className="field"><span>Найти предмет</span><input type="search" value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="inventory-item-list">{items.filter(i=>String(i.name??'').toLowerCase().includes(search.toLowerCase())).map(i=><button key={i.id} className={selected?.id===i.id?'active':''} aria-pressed={selected?.id===i.id} onClick={()=>setSelected(i.id)}>{project.resources.find(r=>r.id===i.iconResourceId)?.source?<img src={project.resources.find(r=>r.id===i.iconResourceId).source} alt=""/>:<Package/>}<span>{i.name}</span></button>)}</div></aside>
   {selected&&<div className="inventory-definition" data-editor-location={JSON.stringify(['inventory',selected.id])}><label className="field"><span>Название предмета</span><input value={selected.name??''} onChange={e=>updateItem(selected.id,{name:e.target.value})}/></label><label className="field"><span>Описание предмета</span><textarea rows="4" value={selected.description??''} onChange={e=>updateItem(selected.id,{description:e.target.value})}/></label><label className="field"><span>Иконка в инвентаре</span><select value={selected.iconResourceId??''} onChange={e=>updateItem(selected.id,{iconResourceId:e.target.value||null})}><option value="">Без иконки</option>{images.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
    <div className="inventory-references"><h3>Где используется · {uses.length}</h3>{uses.length?<><p>Используемый предмет нельзя удалить. Сначала измените эти условия и результаты.</p>{uses.map((use,i)=><button key={i} onClick={()=>open(use)}><ArrowSquareOut/>{use.label}</button>)}</>:<p>Пока нигде. Выберите этот предмет в реакции, результате или условии.</p>}</div>
    <button className="button danger-button" disabled={uses.length>0} onClick={()=>removeItem(selected.id)}><Trash/>Удалить предмет</button>
   </div>}
  </div>}{error&&<p role="alert">{error}</p>}
 </section>;
}
