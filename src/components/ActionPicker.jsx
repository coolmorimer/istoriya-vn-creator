import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MagnifyingGlass, Plus, X } from "@phosphor-icons/react";

export function ActionPicker({ actions, onChoose, onClose }) {
  const [query, setQuery] = useState("");
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.querySelector("input")?.focus();
    const key = (event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key === "Tab") {
        const items = [...dialog.current.querySelectorAll("input,button")].filter((item) => !item.disabled);
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("keydown", key, true); previous?.focus(); };
  }, [onClose]);
  const groups = [
    ["История", ["dialogue", "narration", "choice", "jump", "end"]],
    ["Сцена и персонажи", ["background", "showCharacter", "hideCharacter", "changeSprite", "moveCharacter", "characterAnimation", "showCG", "hideCG", "effect"]],
    ["Звук", ["music", "stopMusic", "sound", "voice", "ambience"]],
    ["Логика", ["variable", "flag", "condition", "event", "pause"]],
  ];
  const matches = actions.filter(([, name]) => name.toLowerCase().includes(query.toLowerCase().trim()));
  return createPortal(<div className="action-picker-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialog} className="action-picker" role="dialog" aria-modal="true" aria-labelledby="action-picker-title"><header><div><h2 id="action-picker-title">Добавить действие</h2><p>После выбора блок появится в сценарии, а его настройки — справа.</p></div><button aria-label="Закрыть меню действий" onClick={onClose}><X size={22} /></button></header><label className="action-picker-search"><MagnifyingGlass /><input placeholder="Найти действие…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="action-picker-groups">{groups.map(([name, types]) => { const items = matches.filter(([type]) => types.includes(type)); return items.length > 0 && <section key={name}><h3>{name}</h3><div>{items.map(([type, label]) => <button key={type} onClick={() => onChoose(type)}><Plus /><span>{label}</span></button>)}</div></section>; })}{!matches.length && <p>Ничего не найдено. Попробуйте другое название.</p>}</div></section></div>, document.body);
}
