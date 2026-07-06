export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error('Missing element #' + id);
  return el as T;
}

export type StatusKind = 'info' | 'ok' | 'pending' | 'warn' | 'err';

// textContent i stället för innerHTML: statusrader kan innehålla data från en
// främmande .ots-fil eller externa API:er och får aldrig tolkas som HTML.
export function createStatusList(listEl: HTMLElement, idPrefix: string) {
  return {
    el: listEl,
    set(id: string, text: string, kind: StatusKind): HTMLElement {
      let el = document.getElementById(idPrefix + id);
      if (!el) {
        el = document.createElement('div');
        el.id = idPrefix + id;
        listEl.appendChild(el);
      }
      el.className = 'status ' + kind;
      el.textContent = text;
      return el;
    },
    remove(id: string): void {
      document.getElementById(idPrefix + id)?.remove();
    },
    clear(): void {
      listEl.innerHTML = '';
    },
  };
}

// Bygger en verdict-banner med DOM-noder så att detaljrader (t.ex. data från
// blockutforskar-API:t eller felmeddelanden) aldrig tolkas som HTML.
export function makeVerdictBanner(
  cls: 'verified' | 'pending' | 'failed',
  symbol: string,
  labelText: string,
  detailLines: string[],
): HTMLElement {
  const banner = document.createElement('div');
  banner.className = 'verdict-banner ' + cls;
  const big = document.createElement('span');
  big.className = 'big';
  big.textContent = symbol;
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = labelText;
  banner.append(big, label);
  if (detailLines.length) {
    const detail = document.createElement('div');
    detail.className = 'detail';
    detailLines.forEach((line, i) => {
      if (i > 0) detail.append(document.createElement('br'));
      detail.append(line);
    });
    banner.append(detail);
  }
  return banner;
}

// Gemensam drag & drop-koppling för en drop-yta + tillhörande file-input.
// change-händelsen kan ge null (avbruten filväljare) — drop ger alltid en fil.
export function wireDrop(
  dropEl: HTMLElement,
  inputEl: HTMLInputElement,
  onFile: (f: File | null) => void,
): void {
  inputEl.addEventListener('change', () => {
    onFile(inputEl.files?.[0] ?? null);
  });
  for (const ev of ['dragover', 'dragenter'] as const) {
    dropEl.addEventListener(ev, e => { e.preventDefault(); dropEl.classList.add('over'); });
  }
  for (const ev of ['dragleave', 'drop'] as const) {
    dropEl.addEventListener(ev, e => { e.preventDefault(); dropEl.classList.remove('over'); });
  }
  dropEl.addEventListener('drop', e => {
    const f = (e as DragEvent).dataTransfer?.files[0];
    if (f) onFile(f);
  });
}
