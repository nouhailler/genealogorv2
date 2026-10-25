import { GenealogyData, Individual, Family, LifeEvent, ParsedDate, Sex, GenealogicalSource, SourceCitation } from '../types/genealogy';

const MONTH_MAP: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
  JANV: 1, FEVR: 2, MARS: 3, AVR: 4, MAI: 5, JUIN: 6,
  JUIL: 7, AOUT: 8, SEPT: 9, OCTO: 10, NOVEM: 11, DECEM: 12,
};

export function parseGedcomDate(rawDate?: string): ParsedDate | undefined {
  if (!rawDate) return undefined;
  const raw = rawDate.trim();
  const upper = raw.toUpperCase();

  const isApproximate = upper.includes('ABT') || upper.includes('CAL') || upper.includes('EST') || upper.includes('VERS') || upper.includes('CA') || upper.includes('ENV');
  const isBefore = upper.includes('BEF') || upper.includes('AVANT') || upper.includes('AV.');
  const isAfter = upper.includes('AFT') || upper.includes('APRES') || upper.includes('APR.');
  const isBetween = upper.includes('BET') || upper.includes('ENTRE');

  // Match 4-digit years
  const years = upper.match(/\b\d{4}\b/g);
  const year = years && years.length > 0 ? parseInt(years[0], 10) : undefined;
  const year2 = years && years.length > 1 ? parseInt(years[1], 10) : undefined;

  // Match month
  let month: number | undefined;
  for (const [mName, mNum] of Object.entries(MONTH_MAP)) {
    if (upper.includes(mName)) {
      month = mNum;
      break;
    }
  }

  // Match day
  const dayMatch = upper.match(/\b([0-2]?\d|3[01])\b/);
  const day = dayMatch && (!year || parseInt(dayMatch[1], 10) !== year) ? parseInt(dayMatch[1], 10) : undefined;

  return {
    raw,
    year,
    month,
    day,
    isApproximate,
    isBefore,
    isAfter,
    isBetween,
    year2,
  };
}

export function parseGedcom(content: string): GenealogyData {
  const lines = content.split(/\r?\n/);
  const individuals: Record<string, Individual> = {};
  const families: Record<string, Family> = {};
  const sources: Record<string, GenealogicalSource> = {};
  let sourceHeader = '';

  let currentIndi: Partial<Individual> | null = null;
  let currentFam: Partial<Family> | null = null;
  let currentSource: Partial<GenealogicalSource> | null = null;
  let currentEvent: { target: 'birth' | 'death' | 'baptism' | 'burial' | 'marriage' | 'divorce' | 'residence'; event: LifeEvent } | null = null;
  let currentMedia: { title?: string; file?: string; format?: string } | null = null;
  let currentCitation: SourceCitation | null = null;
  let lastTextContainer: { get: () => string; set: (val: string) => void } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const tokens = line.split(' ');
    const level = parseInt(tokens[0], 10);
    if (isNaN(level)) continue;

    let pointer = '';
    let tag = '';
    let value = '';

    if (tokens[1] && tokens[1].startsWith('@') && tokens[1].endsWith('@')) {
      pointer = tokens[1];
      tag = tokens[2] || '';
      value = tokens.slice(3).join(' ');
    } else {
      tag = tokens[1] || '';
      value = tokens.slice(2).join(' ');
    }

    // Support multiline CONC / CONT
    if (tag === 'CONC' && lastTextContainer) {
      lastTextContainer.set(lastTextContainer.get() + value);
      continue;
    }
    if (tag === 'CONT' && lastTextContainer) {
      lastTextContainer.set(lastTextContainer.get() + '\n' + value);
      continue;
    }

    if (level === 0) {
      // Save current entity before starting new level 0
      if (currentIndi && currentIndi.id) {
        individuals[currentIndi.id] = finalizeIndividual(currentIndi);
        currentIndi = null;
      }
      if (currentFam && currentFam.id) {
        families[currentFam.id] = finalizeFamily(currentFam);
        currentFam = null;
      }
      if (currentSource && currentSource.id) {
        sources[currentSource.id] = finalizeSource(currentSource);
        currentSource = null;
      }
      currentEvent = null;
      currentMedia = null;
      currentCitation = null;
      lastTextContainer = null;

      if (tag === 'INDI') {
        currentIndi = {
          id: pointer,
          name: '',
          sex: 'X',
          familiesAsSpouse: [],
          familiesAsChild: [],
          occupations: [],
          residences: [],
          notes: [],
          _unsupportedTags: [],
        };
      } else if (tag === 'FAM') {
        currentFam = {
          id: pointer,
          childrenIds: [],
          notes: [],
          _unsupportedTags: [],
        };
      } else if (tag === 'SOUR' && pointer) {
        currentSource = {
          id: pointer,
          title: value || 'Source sans titre',
          notes: [],
        };
      } else if (tag === 'HEAD') {
        sourceHeader = 'GEDCOM File';
      }
      continue;
    }

    // Inside SOUR (level 0 record)
    if (currentSource) {
      if (level === 1) {
        if (tag === 'TITL') currentSource.title = value;
        else if (tag === 'AUTH') currentSource.author = value;
        else if (tag === 'PUBL') currentSource.publication = value;
        else if (tag === 'NOTE') {
          currentSource.notes?.push(value);
          const idx = (currentSource.notes?.length || 1) - 1;
          lastTextContainer = {
            get: () => currentSource!.notes![idx],
            set: (v) => { currentSource!.notes![idx] = v; }
          };
        }
      }
      continue;
    }

    // Inside INDI
    if (currentIndi) {
      if (level === 1) {
        currentEvent = null;
        currentMedia = null;
        currentCitation = null;
        lastTextContainer = null;
        switch (tag) {
          case 'NAME': {
            currentIndi.name = value.replace(/\//g, '').trim();
            const slashMatch = value.match(/\/(.*?)\//);
            if (slashMatch) {
              currentIndi.surname = slashMatch[1].trim();
              const beforeSlash = value.substring(0, value.indexOf('/')).trim();
              if (beforeSlash) currentIndi.givenName = beforeSlash;
            } else {
              currentIndi.givenName = value.trim();
            }
            break;
          }
          case 'GIVN':
            currentIndi.givenName = value.trim();
            break;
          case 'SURN':
            currentIndi.surname = value.trim();
            break;
          case 'SEX':
            currentIndi.sex = (value.trim().toUpperCase() === 'M' ? 'M' : value.trim().toUpperCase() === 'F' ? 'F' : 'X') as Sex;
            break;
          case 'BIRT':
            currentIndi.birth = {};
            currentEvent = { target: 'birth', event: currentIndi.birth };
            break;
          case 'DEAT':
            currentIndi.death = {};
            currentEvent = { target: 'death', event: currentIndi.death };
            break;
          case 'BAPM':
            currentIndi.baptism = {};
            currentEvent = { target: 'baptism', event: currentIndi.baptism };
            break;
          case 'BURI':
            currentIndi.burial = {};
            currentEvent = { target: 'burial', event: currentIndi.burial };
            break;
          case 'OCCU':
            if (value) currentIndi.occupations?.push(value.trim());
            break;
          case 'RESI': {
            const resEvent: LifeEvent = {};
            currentIndi.residences?.push(resEvent);
            currentEvent = { target: 'residence', event: resEvent };
            break;
          }
          case 'FAMS':
            if (value) currentIndi.familiesAsSpouse?.push(value.trim());
            break;
          case 'FAMC':
            if (value) currentIndi.familiesAsChild?.push(value.trim());
            break;
          case 'NOTE':
            if (value) {
              currentIndi.notes?.push(value.trim());
              const idx = (currentIndi.notes?.length || 1) - 1;
              lastTextContainer = {
                get: () => currentIndi!.notes![idx],
                set: (v) => { currentIndi!.notes![idx] = v; }
              };
            }
            break;
          case 'OBJE': {
            if (!currentIndi.media) currentIndi.media = [];
            const m = { title: value || undefined };
            currentIndi.media.push(m);
            currentMedia = m;
            break;
          }
          case 'SOUR': {
            if (value) {
              if (!currentIndi.citations) currentIndi.citations = [];
              const cit: SourceCitation = { sourceId: value.trim() };
              currentIndi.citations.push(cit);
              currentCitation = cit;
            }
            break;
          }
          default:
            // Preserve unsupported tags without silent data loss
            currentIndi._unsupportedTags?.push({ tag, value, level });
            break;
        }
      } else if (level === 2) {
        if (currentMedia) {
          if (tag === 'FILE') currentMedia.file = value.trim();
          else if (tag === 'TITL') currentMedia.title = value.trim();
          else if (tag === 'FORM') currentMedia.format = value.trim();
        }
        if (currentEvent) {
          if (tag === 'DATE') {
            currentEvent.event.date = value.trim();
            currentEvent.event.parsedDate = parseGedcomDate(value.trim());
          } else if (tag === 'PLAC') {
            currentEvent.event.place = value.trim();
          } else if (tag === 'NOTE') {
            if (!currentEvent.event.notes) currentEvent.event.notes = [];
            currentEvent.event.notes.push(value.trim());
            const idx = currentEvent.event.notes.length - 1;
            lastTextContainer = {
              get: () => currentEvent!.event.notes![idx],
              set: (v) => { currentEvent!.event.notes![idx] = v; }
            };
          } else if (tag === 'SOUR') {
            if (!currentEvent.event.citations) currentEvent.event.citations = [];
            const cit: SourceCitation = { sourceId: value.trim() };
            currentEvent.event.citations.push(cit);
            currentCitation = cit;
          }
        }
        if (tag === 'PAGE' && currentCitation) {
          currentCitation.page = value.trim();
        }
      } else if (level === 3) {
        if (currentCitation) {
          if (tag === 'PAGE') {
            currentCitation.page = value.trim();
          } else if (tag === 'NOTE') {
            currentCitation.notes = value.trim();
            lastTextContainer = {
              get: () => currentCitation!.notes || '',
              set: (v) => { currentCitation!.notes = v; }
            };
          }
        }
      }
      continue;
    }

    // Inside FAM
    if (currentFam) {
      if (level === 1) {
        currentEvent = null;
        currentMedia = null;
        currentCitation = null;
        lastTextContainer = null;
        switch (tag) {
          case 'HUSB':
            currentFam.husbandId = value.trim();
            break;
          case 'WIFE':
            currentFam.wifeId = value.trim();
            break;
          case 'CHIL':
            if (value) currentFam.childrenIds?.push(value.trim());
            break;
          case 'MARR':
            currentFam.marriage = {};
            currentEvent = { target: 'marriage', event: currentFam.marriage };
            break;
          case 'DIV':
            currentFam.divorce = {};
            currentEvent = { target: 'divorce', event: currentFam.divorce };
            break;
          case 'NOTE':
            if (value) {
              currentFam.notes?.push(value.trim());
              const idx = (currentFam.notes?.length || 1) - 1;
              lastTextContainer = {
                get: () => currentFam!.notes![idx],
                set: (v) => { currentFam!.notes![idx] = v; }
              };
            }
            break;
          case 'OBJE': {
            if (!currentFam.media) currentFam.media = [];
            const m = { title: value || undefined };
            currentFam.media.push(m);
            currentMedia = m;
            break;
          }
          case 'SOUR': {
            if (value) {
              if (!currentFam.citations) currentFam.citations = [];
              const cit: SourceCitation = { sourceId: value.trim() };
              currentFam.citations.push(cit);
              currentCitation = cit;
            }
            break;
          }
          default:
            currentFam._unsupportedTags?.push({ tag, value, level });
            break;
        }
      } else if (level === 2) {
        if (currentMedia) {
          if (tag === 'FILE') currentMedia.file = value.trim();
          else if (tag === 'TITL') currentMedia.title = value.trim();
          else if (tag === 'FORM') currentMedia.format = value.trim();
        }
        if (currentEvent) {
          if (tag === 'DATE') {
            currentEvent.event.date = value.trim();
            currentEvent.event.parsedDate = parseGedcomDate(value.trim());
          } else if (tag === 'PLAC') {
            currentEvent.event.place = value.trim();
          } else if (tag === 'NOTE') {
            if (!currentEvent.event.notes) currentEvent.event.notes = [];
            currentEvent.event.notes.push(value.trim());
            const idx = currentEvent.event.notes.length - 1;
            lastTextContainer = {
              get: () => currentEvent!.event.notes![idx],
              set: (v) => { currentEvent!.event.notes![idx] = v; }
            };
          } else if (tag === 'SOUR') {
            if (!currentEvent.event.citations) currentEvent.event.citations = [];
            const cit: SourceCitation = { sourceId: value.trim() };
            currentEvent.event.citations.push(cit);
            currentCitation = cit;
          }
        }
        if (tag === 'PAGE' && currentCitation) {
          currentCitation.page = value.trim();
        }
      } else if (level === 3) {
        if (currentCitation) {
          if (tag === 'PAGE') {
            currentCitation.page = value.trim();
          } else if (tag === 'NOTE') {
            currentCitation.notes = value.trim();
            lastTextContainer = {
              get: () => currentCitation!.notes || '',
              set: (v) => { currentCitation!.notes = v; }
            };
          }
        }
      }
    }
  }

  // Finalize last records
  if (currentIndi && currentIndi.id) {
    individuals[currentIndi.id] = finalizeIndividual(currentIndi);
  }
  if (currentFam && currentFam.id) {
    families[currentFam.id] = finalizeFamily(currentFam);
  }
  if (currentSource && currentSource.id) {
    sources[currentSource.id] = finalizeSource(currentSource);
  }

  const indiKeys = Object.keys(individuals);
  let rootPersonId = indiKeys[0];
  for (const id of indiKeys) {
    if (individuals[id].sosaNumber === 1) {
      rootPersonId = id;
      break;
    }
  }

  return {
    individuals,
    families,
    sources,
    rootPersonId,
    sourceHeader,
  };
}

function finalizeIndividual(partial: Partial<Individual>): Individual {
  const name = partial.name || `${partial.givenName || ''} ${partial.surname || ''}`.trim() || 'Inconnu';
  return {
    id: partial.id || `@I${Math.random().toString(36).substring(2, 7)}@`,
    name,
    givenName: partial.givenName || '',
    surname: partial.surname || '',
    sex: partial.sex || 'X',
    birth: partial.birth,
    death: partial.death,
    baptism: partial.baptism,
    burial: partial.burial,
    occupations: partial.occupations || [],
    residences: partial.residences || [],
    notes: partial.notes || [],
    familiesAsSpouse: partial.familiesAsSpouse || [],
    familiesAsChild: partial.familiesAsChild || [],
    citations: partial.citations || [],
    media: partial.media || [],
    _unsupportedTags: partial._unsupportedTags || [],
  };
}

function finalizeFamily(partial: Partial<Family>): Family {
  return {
    id: partial.id || `@F${Math.random().toString(36).substring(2, 7)}@`,
    husbandId: partial.husbandId,
    wifeId: partial.wifeId,
    childrenIds: partial.childrenIds || [],
    marriage: partial.marriage,
    divorce: partial.divorce,
    notes: partial.notes || [],
    citations: partial.citations || [],
    media: partial.media || [],
    _unsupportedTags: partial._unsupportedTags || [],
  };
}

function finalizeSource(partial: Partial<GenealogicalSource>): GenealogicalSource {
  return {
    id: partial.id || `@S${Math.random().toString(36).substring(2, 7)}@`,
    title: partial.title || 'Source sans titre',
    author: partial.author,
    publication: partial.publication,
    repository: partial.repository,
    callNumber: partial.callNumber,
    url: partial.url,
    notes: partial.notes || [],
  };
}
