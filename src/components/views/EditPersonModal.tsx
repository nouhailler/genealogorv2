import React, { useState } from 'react';
import { X, Save, User, Calendar, MapPin, Briefcase } from 'lucide-react';
import { Individual, Sex } from '../../types/genealogy';
import { parseGedcomDate } from '../../lib/gedcom-parser';
import { InfoTooltip } from '../InfoTooltip';

interface EditPersonModalProps {
  person: Individual | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: Individual) => void;
}

export const EditPersonModal: React.FC<EditPersonModalProps> = ({
  person,
  isOpen,
  onClose,
  onSave,
}) => {
  if (!isOpen || !person) return null;

  const [givenName, setGivenName] = useState(person.givenName || '');
  const [surname, setSurname] = useState(person.surname || '');
  const [sex, setSex] = useState<Sex>(person.sex || 'X');
  const [birthDate, setBirthDate] = useState(person.birth?.date || '');
  const [birthPlace, setBirthPlace] = useState(person.birth?.place || '');
  const [deathDate, setDeathDate] = useState(person.death?.date || '');
  const [deathPlace, setDeathPlace] = useState(person.death?.place || '');
  const [occupations, setOccupations] = useState(person.occupations?.join(', ') || '');
  const [notes, setNotes] = useState(person.notes?.join('\n') || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: Individual = {
      ...person,
      givenName: givenName.trim(),
      surname: surname.trim(),
      name: `${givenName.trim()} ${surname.trim()}`.trim() || 'Inconnu',
      sex,
      birth: birthDate || birthPlace ? {
        date: birthDate.trim() || undefined,
        place: birthPlace.trim() || undefined,
        parsedDate: parseGedcomDate(birthDate.trim()),
      } : undefined,
      death: deathDate || deathPlace ? {
        date: deathDate.trim() || undefined,
        place: deathPlace.trim() || undefined,
        parsedDate: parseGedcomDate(deathDate.trim()),
      } : undefined,
      occupations: occupations.trim() ? occupations.split(',').map(s => s.trim()).filter(Boolean) : [],
      notes: notes.trim() ? notes.split('\n').map(s => s.trim()).filter(Boolean) : [],
    };

    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 dark:bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#1A1D24] border border-stone-300 dark:border-stone-700 shadow-2xl rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto text-stone-900 dark:text-stone-100 transition-colors">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200/80 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-amber-800 dark:text-amber-400" />
            <h2 className="font-serif text-lg font-bold text-stone-900 dark:text-stone-100">
              Modifier la Fiche Généalogique
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Prénom, Nom, Sexe */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <div className="flex items-center gap-1 mb-1">
                <label className="text-xs font-medium text-stone-700 dark:text-stone-300">Prénom(s)</label>
                <InfoTooltip content="Prénom(s) complets d'après les actes d'état civil ou paroissiaux." />
              </div>
              <input
                type="text"
                required
                value={givenName}
                onChange={e => setGivenName(e.target.value)}
                className="w-full text-xs bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-amber-800"
              />
            </div>

            <div>
              <div className="flex items-center gap-1 mb-1">
                <label className="text-xs font-medium text-stone-700 dark:text-stone-300">Nom (Patronyme)</label>
                <InfoTooltip content="Patronyme principal de famille. Éviter d'y inclure les surnoms ou titres." />
              </div>
              <input
                type="text"
                required
                value={surname}
                onChange={e => setSurname(e.target.value)}
                className="w-full text-xs bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-amber-800"
              />
            </div>

            <div>
              <div className="flex items-center gap-1 mb-1">
                <label className="text-xs font-medium text-stone-700 dark:text-stone-300">Sexe</label>
                <InfoTooltip content="Détermine l'affichage et les calculs de numérotation Sosa (Masculin = pair, Féminin = impair)." />
              </div>
              <select
                value={sex}
                onChange={e => setSex(e.target.value as Sex)}
                className="w-full text-xs bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-amber-800"
              >
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
                <option value="X">Indéterminé</option>
              </select>
            </div>
          </div>

          {/* Naissance */}
          <div className="p-3 bg-stone-50/70 dark:bg-stone-900/40 border border-stone-200 dark:border-stone-800 rounded-xl space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-stone-800 dark:text-stone-200">Naissance / Baptême</span>
              <InfoTooltip content="Format standard GEDCOM (ex: 14 MAY 1742 ou 14/05/1742) ou républicain (ex: 18 Brumaire An VIII)." />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-stone-500 dark:text-stone-400 mb-0.5">Date (ex: 14 MAY 1742)</label>
                <input
                  type="text"
                  value={birthDate}
                  onChange={e => setBirthDate(e.target.value)}
                  className="w-full text-xs bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-amber-800"
                />
              </div>
              <div>
                <label className="block text-[11px] text-stone-500 dark:text-stone-400 mb-0.5">Lieu / Paroisse</label>
                <input
                  type="text"
                  value={birthPlace}
                  onChange={e => setBirthPlace(e.target.value)}
                  className="w-full text-xs bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-amber-800"
                />
              </div>
            </div>
          </div>

          {/* Décès */}
          <div className="p-3 bg-stone-50/70 dark:bg-stone-900/40 border border-stone-200 dark:border-stone-800 rounded-xl space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-stone-800 dark:text-stone-200">Décès / Sépulture</span>
              <InfoTooltip content="Laisser vide si l'individu est encore en vie. Si né il y a moins de 100 ans et vivant, il sera protégé par l'anonymisation contemporains." />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-stone-500 dark:text-stone-400 mb-0.5">Date (laisser vide si vivant)</label>
                <input
                  type="text"
                  value={deathDate}
                  onChange={e => setDeathDate(e.target.value)}
                  className="w-full text-xs bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-amber-800"
                />
              </div>
              <div>
                <label className="block text-[11px] text-stone-500 dark:text-stone-400 mb-0.5">Lieu</label>
                <input
                  type="text"
                  value={deathPlace}
                  onChange={e => setDeathPlace(e.target.value)}
                  className="w-full text-xs bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-amber-800"
                />
              </div>
            </div>
          </div>

          {/* Métier */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <label className="text-xs font-medium text-stone-700 dark:text-stone-300">
                Profession(s) (séparées par une virgule)
              </label>
              <InfoTooltip content="Indiquez les professions exercées (ex: Maître charpentier, Meunier, Vigneron)." />
            </div>
            <input
              type="text"
              value={occupations}
              onChange={e => setOccupations(e.target.value)}
              placeholder="Ex: Maître charpentier de marine, Négociant"
              className="w-full text-xs bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-amber-800"
            />
          </div>

          {/* Notes */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <label className="text-xs font-medium text-stone-700 dark:text-stone-300">Notes biographiques & Sources</label>
              <InfoTooltip content="Cotes d'archives, actes notariés, signatures ou faits marquants de vie." />
            </div>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Éléments d'histoire, signatures, citations..."
              className="w-full text-xs bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-amber-800"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200 dark:border-stone-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 dark:bg-amber-800 dark:hover:bg-amber-700 rounded-lg shadow-sm cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Enregistrer</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
