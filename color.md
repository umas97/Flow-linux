# Palette 24 colori accento

Palette di 24 tinte distribuite uniformemente sulla ruota cromatica (ogni 15°),
con varianti dedicate per tema chiaro e tema scuro. Tutte le combinazioni
colore/testo sono verificate a contrasto **WCAG AA (≥ 4.5:1)**.

## Come è organizzata

- **Tema chiaro**: colore più scuro e saturo, per sfondi bianchi (badge, bottoni, tag)
- **Tema scuro**: colore più chiaro, per sfondi scuri senza affaticare la vista
- Ogni colore ha un testo consigliato (`bianco` o `quasi-nero #1A1A1A`) già verificato

## CSS custom properties

Copia questo blocco nel tuo foglio di stile globale. Passa automaticamente da
chiaro a scuro con `prefers-color-scheme`, oppure sostituisci il media query
con un selettore `[data-theme="dark"]` se gestisci il tema manualmente.

```css
:root {
  --accent-1-rosso:          #AE2929;
  --accent-1-rosso-text:     #FFFFFF;
  --accent-2-corallo:        #AE4A29;
  --accent-2-corallo-text:   #FFFFFF;
  --accent-3-arancio:        #9D6125;
  --accent-3-arancio-text:   #FFFFFF;
  --accent-4-ambra:          #AE8C29;
  --accent-4-ambra-text:     #1A1A1A;
  --accent-5-oro:            #AEAE29;
  --accent-5-oro-text:       #1A1A1A;
  --accent-6-lime-oro:       #8CAE29;
  --accent-6-lime-oro-text:  #1A1A1A;
  --accent-7-lime:           #6BAE29;
  --accent-7-lime-text:      #1A1A1A;
  --accent-8-verde-prato:    #4AAE29;
  --accent-8-verde-prato-text: #1A1A1A;
  --accent-9-smeraldo:       #29AE29;
  --accent-9-smeraldo-text:  #1A1A1A;
  --accent-10-verde-menta:   #29AE4A;
  --accent-10-verde-menta-text: #1A1A1A;
  --accent-11-teal:          #29AE6B;
  --accent-11-teal-text:     #1A1A1A;
  --accent-12-ciano:         #29AE8C;
  --accent-12-ciano-text:    #1A1A1A;
  --accent-13-azzurro:       #29AEAE;
  --accent-13-azzurro-text:  #1A1A1A;
  --accent-14-blu-cielo:     #298CAE;
  --accent-14-blu-cielo-text: #1A1A1A;
  --accent-15-blu:           #296BAE;
  --accent-15-blu-text:      #FFFFFF;
  --accent-16-indaco:        #294AAE;
  --accent-16-indaco-text:   #FFFFFF;
  --accent-17-viola:         #2929AE;
  --accent-17-viola-text:    #FFFFFF;
  --accent-18-ametista:      #4A29AE;
  --accent-18-ametista-text: #FFFFFF;
  --accent-19-magenta:       #6B29AE;
  --accent-19-magenta-text:  #FFFFFF;
  --accent-20-orchidea:      #8C29AE;
  --accent-20-orchidea-text: #FFFFFF;
  --accent-21-fucsia:        #AE29AE;
  --accent-21-fucsia-text:   #FFFFFF;
  --accent-22-rosa:          #AE298C;
  --accent-22-rosa-text:     #FFFFFF;
  --accent-23-rosa-corallo:  #AE296B;
  --accent-23-rosa-corallo-text: #FFFFFF;
  --accent-24-rosso-mattone: #AE294A;
  --accent-24-rosso-mattone-text: #FFFFFF;
}

@media (prefers-color-scheme: dark) {
  :root {
    --accent-1-rosso:          #E17070;
    --accent-1-rosso-text:     #1A1A1A;
    --accent-2-corallo:        #E18C70;
    --accent-2-corallo-text:   #1A1A1A;
    --accent-3-arancio:        #E1A870;
    --accent-3-arancio-text:   #1A1A1A;
    --accent-4-ambra:          #E1C470;
    --accent-4-ambra-text:     #1A1A1A;
    --accent-5-oro:            #E1E170;
    --accent-5-oro-text:       #1A1A1A;
    --accent-6-lime-oro:       #C4E170;
    --accent-6-lime-oro-text:  #1A1A1A;
    --accent-7-lime:           #A8E170;
    --accent-7-lime-text:      #1A1A1A;
    --accent-8-verde-prato:    #8CE170;
    --accent-8-verde-prato-text: #1A1A1A;
    --accent-9-smeraldo:       #70E170;
    --accent-9-smeraldo-text:  #1A1A1A;
    --accent-10-verde-menta:   #70E18C;
    --accent-10-verde-menta-text: #1A1A1A;
    --accent-11-teal:          #70E1A8;
    --accent-11-teal-text:     #1A1A1A;
    --accent-12-ciano:         #70E1C4;
    --accent-12-ciano-text:    #1A1A1A;
    --accent-13-azzurro:       #70E1E1;
    --accent-13-azzurro-text:  #1A1A1A;
    --accent-14-blu-cielo:     #70C4E1;
    --accent-14-blu-cielo-text: #1A1A1A;
    --accent-15-blu:           #70A8E1;
    --accent-15-blu-text:      #1A1A1A;
    --accent-16-indaco:        #708CE1;
    --accent-16-indaco-text:   #1A1A1A;
    --accent-17-viola:         #8181E4;
    --accent-17-viola-text:    #1A1A1A;
    --accent-18-ametista:      #8C70E1;
    --accent-18-ametista-text: #1A1A1A;
    --accent-19-magenta:       #A870E1;
    --accent-19-magenta-text:  #1A1A1A;
    --accent-20-orchidea:      #C470E1;
    --accent-20-orchidea-text: #1A1A1A;
    --accent-21-fucsia:        #E170E1;
    --accent-21-fucsia-text:   #1A1A1A;
    --accent-22-rosa:          #E170C4;
    --accent-22-rosa-text:     #1A1A1A;
    --accent-23-rosa-corallo:  #E170A8;
    --accent-23-rosa-corallo-text: #1A1A1A;
    --accent-24-rosso-mattone: #E1708C;
    --accent-24-rosso-mattone-text: #1A1A1A;
  }
}
```

### Uso

```css
.badge-successo {
  background: var(--accent-9-smeraldo);
  color: var(--accent-9-smeraldo-text);
}
```

Se preferisci uno switch manuale (toggle in-app anziché seguire le impostazioni
di sistema), sostituisci `@media (prefers-color-scheme: dark)` con:

```css
[data-theme="dark"] {
  /* stesse variabili */
}
```

e imposta `data-theme="dark"` sull'elemento `<html>` via JavaScript.

## Tabella di riferimento

| # | Nome | Hex chiaro | Testo su chiaro | Contrasto | Hex scuro | Testo su scuro | Contrasto |
|---|------|-----------|------------------|-----------|-----------|-----------------|-----------|
| 1 | Rosso | `#AE2929` | bianco | 6.67 | `#E17070` | quasi-nero | 5.60 |
| 2 | Corallo | `#AE4A29` | bianco | 5.51 | `#E18C70` | quasi-nero | 6.78 |
| 3 | Arancio | `#9D6125` | bianco | 5.04 | `#E1A870` | quasi-nero | 8.32 |
| 4 | Ambra | `#AE8C29` | quasi-nero | 5.46 | `#E1C470` | quasi-nero | 10.22 |
| 5 | Oro | `#AEAE29` | quasi-nero | 7.36 | `#E1E170` | quasi-nero | 12.60 |
| 6 | Lime-oro | `#8CAE29` | quasi-nero | 6.80 | `#C4E170` | quasi-nero | 11.89 |
| 7 | Lime | `#6BAE29` | quasi-nero | 6.39 | `#A8E170` | quasi-nero | 11.33 |
| 8 | Verde prato | `#4AAE29` | quasi-nero | 6.11 | `#8CE170` | quasi-nero | 10.87 |
| 9 | Smeraldo | `#29AE29` | quasi-nero | 5.95 | `#70E170` | quasi-nero | 10.52 |
| 10 | Verde menta | `#29AE4A` | quasi-nero | 6.01 | `#70E18C` | quasi-nero | 10.64 |
| 11 | Teal | `#29AE6B` | quasi-nero | 6.10 | `#70E1A8` | quasi-nero | 10.79 |
| 12 | Ciano | `#29AE8C` | quasi-nero | 6.24 | `#70E1C4` | quasi-nero | 10.99 |
| 13 | Azzurro | `#29AEAE` | quasi-nero | 6.43 | `#70E1E1` | quasi-nero | 11.23 |
| 14 | Blu cielo | `#298CAE` | quasi-nero | 4.52 | `#70C4E1` | quasi-nero | 8.84 |
| 15 | Blu | `#296BAE` | bianco | 5.51 | `#70A8E1` | quasi-nero | 6.94 |
| 16 | Indaco | `#294AAE` | bianco | 7.82 | `#708CE1` | quasi-nero | 5.41 |
| 17 | Viola | `#2929AE` | bianco | 10.38 | `#8181E4` | quasi-nero | 5.13 |
| 18 | Ametista | `#4A29AE` | bianco | 9.46 | `#8C70E1` | quasi-nero | 4.57 |
| 19 | Magenta | `#6B29AE` | bianco | 8.22 | `#A870E1` | quasi-nero | 5.03 |
| 20 | Orchidea | `#8C29AE` | bianco | 6.90 | `#C470E1` | quasi-nero | 5.60 |
| 21 | Fucsia | `#AE29AE` | bianco | 5.63 | `#E170E1` | quasi-nero | 6.30 |
| 22 | Rosa | `#AE298C` | bianco | 6.01 | `#E170C4` | quasi-nero | 6.06 |
| 23 | Rosa corallo | `#AE296B` | bianco | 6.31 | `#E170A8` | quasi-nero | 5.87 |
| 24 | Rosso mattone | `#AE294A` | bianco | 6.53 | `#E1708C` | quasi-nero | 5.72 |

*Contrasto calcolato secondo la formula WCAG 2.1 (rapporto di luminanza relativa).
Tutti i valori superano la soglia AA di 4.5:1 per testo normale.*

## Note d'uso

- Mantieni lo stesso hue tra tema chiaro e scuro per coerenza visiva: cambia
  solo luminosità e saturazione, non il colore stesso.
- Il testo consigliato è pensato per testo/etichette **sopra** un riquadro
  pieno del colore (badge, bottone, tag). Se usi il colore solo come bordo,
  icona o testo su sfondo neutro, il vincolo di contrasto testo-su-colore non
  si applica.
- Per superfici "tenui" (fill leggero + testo scuro sopra, tipo notifiche o
  tag discreti) serve una seconda scala con luminosità diversa: se ti serve,
  posso generarla con lo stesso schema di hue.