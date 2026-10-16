import {useMemo,useState} from 'react';
import {CaretRight} from '@phosphor-icons/react';
import {searchFold,searchPage} from '../domain/projectSearch.js';
export function ResourceUsageList({usages,onOpen}){
 const [query,setQuery]=useState(''),[page,setPage]=useState(0),filtered=useMemo(()=>{const words=searchFold(query).trim().split(/\s+/).filter(Boolean);return usages.filter(use=>words.every(word=>searchFold(use.label).includes(word)));},[usages,query]),result=searchPage(filtered,page);
 return <section className="resource-usages" aria-label="Места использования ресурса"><strong>Где используется · {usages.length}</strong>{usages.length>8&&<label className="field"><span>Найти место использования</span><input type="search" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label>}
  <div className="resource-usage-results">{result.entries.map(use=><button key={use.key} onClick={()=>onOpen(use)}>{use.label}<CaretRight aria-hidden="true"/></button>)}</div>
  {!result.count&&<p role="status">Совпадений нет. Измените запрос.</p>}
  {result.pages>1&&<nav className="resource-usage-pages" aria-label="Страницы мест использования"><button aria-label="Первая страница использований" disabled={!result.page} onClick={()=>setPage(0)}>В начало</button><button disabled={!result.page} onClick={()=>setPage(result.page-1)}>Назад</button><span aria-live="polite">{result.page+1} / {result.pages}</span><button disabled={result.page===result.pages-1} onClick={()=>setPage(result.page+1)}>Далее</button><button aria-label="Последняя страница использований" disabled={result.page===result.pages-1} onClick={()=>setPage(result.pages-1)}>В конец</button></nav>}
 </section>;
}
