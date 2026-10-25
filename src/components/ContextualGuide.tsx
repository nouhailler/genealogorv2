import React, { useState, useEffect } from 'react';
import { 
  HelpCircle, ChevronDown, ChevronUp, X, Sparkles, 
  GitFork, Users, BookOpen, Clock, MapPin, BarChart3, Info 
} from 'lucide-react';
import { ActiveTab } from './Navbar';

const STORAGE_KEY_GUIDES_ENABLED = 'genealogor_context_guides_enabled';
const STORAGE_KEY_COLLAPSED_PREFIX = 'genealogor_guide_collapsed_';

export function areContextGuidesEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const val = localStorage.getItem(STORAGE_KEY_GUIDES_ENABLED);
  return val === null ? true : val === 'true';
}

export function setContextGuidesEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_GUIDES_ENABLED, String(enabled));
  window.dispatchEvent(new Event('genealogor:guides-toggle'));
}

interface GuideContent {
  title: string;
  badge: string;
  icon: React.ReactNode;
  summary: string;
  tips: { label: string; text: string }[];
}

const GUIDES_DATA: Record<ActiveTab, GuideContent> = {
  tree: {
    title: 'Vue Arbre Généalogique & Ascendance Sosa',
    badge: 'Navigation interactive',
    icon: <GitFork className="w-4 h-4 text-amber-700 dark:text-amber-400" />,
    summary: 'Visualisez les filiations directes avec numérotation Sosa-Stradonitz standard (1 = vous ou la racine choisie, 2 = père, 3 = mère, 4 = grand-père paternel).',
    tips: [
      { label: 'Déplacement fluide', text: 'Cliquez et glissez sur le fond pour explorer les générations lointaines.' },
      { label: 'Changer de racine', text: 'Cliquez sur l\'icône de cible sur une fiche pour définir cet ancêtre comme de cujus (racine).' },
      { label: 'Filtre de branche', text: 'Utilisez le sélecteur pour isoler la branche paternelle, maternelle ou l\'arbre complet.' },
      { label: 'Contemporains', text: 'Les personnes nées il y a moins de 100 ans sont automatiquement anonymisées si configuré.' }
    ]
  },
  profile: {
    title: 'Fiche Biographique Individuelle',
    badge: 'Détail de vie',
    icon: <Users className="w-4 h-4 text-amber-700 dark:text-amber-400" />,
    summary: 'Consultez la synthèse complète des étapes de vie d\'un individu (naissance, baptême, unions, professions, décès, sépulture).',
    tips: [
      { label: 'Édition collaborative', text: 'Modifiez les informations avec droits éditeur. Les changements sont synchronisés en direct.' },
      { label: 'Portraits & Photos identifiées', text: 'Retrouvez toutes les photographies d\'archives où cet ancêtre a été marqué par un repère interactif.' },
      { label: 'Sources & Citations', text: 'Associez des cotes d\'archives et références d\'actes pour chaque fait historique.' }
    ]
  },
  archives: {
    title: 'Studio d\'Archives & Marquage Photo Interactif',
    badge: 'Paléographie & Visages',
    icon: <BookOpen className="w-4 h-4 text-amber-700 dark:text-amber-400" />,
    summary: 'Atelier de numérisation, examen des écritures anciennes et identification des visages sur les photographies d\'époque.',
    tips: [
      { label: 'Photo Tagging', text: 'Cliquez sur un visage pour placer un repère et le relier immédiatement à une personne de votre arbre.' },
      { label: 'Filtres paléographiques', text: 'Activez les modes Contraste élevé, Négatif ou Nuances de gris pour déchiffrer les encres estompées.' },
      { label: 'Calendrier Républicain', text: 'Convertissez en un clic les dates de l\'an II à l\'an XIV (ex: 18 Brumaire) en calendrier Grégorien.' }
    ]
  },
  timeline: {
    title: 'Chronologie Historique & Repères de France',
    badge: 'Contexte historique',
    icon: <Clock className="w-4 h-4 text-amber-700 dark:text-amber-400" />,
    summary: 'Mettez la destinée de votre famille en miroir avec les grands événements de l\'histoire (Révolution, Premier Empire, Guerres mondiales).',
    tips: [
      { label: 'Frise interactive', text: 'Suivez la succession chronologique des naissances, mariages et disparitions.' },
      { label: 'Époques et contextes', text: 'Les repères historiques aident à comprendre les contextes migratoires et militaires de vos aïeux.' }
    ]
  },
  map: {
    title: 'Cartographie des Migrations & Lieux de Vie',
    badge: 'Dispersion géographique',
    icon: <MapPin className="w-4 h-4 text-amber-700 dark:text-amber-400" />,
    summary: 'Visualisez la dispersion géographique des paroisses et communes où vos ancêtres sont nés, se sont mariés et sont décédés.',
    tips: [
      { label: 'Parcours des lignées', text: 'Les lignes relient les lieux de vie pour matérialiser les mouvements migratoires au fil des siècles.' },
      { label: 'Communes françaises', text: 'Support complet des toponymes anciens et départements historiques.' }
    ]
  },
  stats: {
    title: 'Statistiques Démographiques & Audit de Cohérence',
    badge: 'Analyses & Détection',
    icon: <BarChart3 className="w-4 h-4 text-amber-700 dark:text-amber-400" />,
    summary: 'Explorez la démographie familiale (âge au mariage, longévité par siècle, naissances par saison) et contrôlez les anomalies chronologiques.',
    tips: [
      { label: 'Anomalies détectées', text: 'Détecte les erreurs de saisie (décès avant naissance, parents trop jeunes ou trop âgés).' },
      { label: 'Fusions et doublons', text: 'Identifie les candidats aux doublons pour fusionner proprement sans créer d\'orphelins.' }
    ]
  },
  ancestors: {
    title: 'Éventail d\'Ascendance Sosa & Tableau Pedigree',
    badge: 'Éventail géométrique',
    icon: <GitFork className="w-4 h-4 text-amber-700 dark:text-amber-400" />,
    summary: 'Explorez la lignée ascendante en éventail circulaire, en tableau pedigree sur 7 générations ou en vue sablier.',
    tips: [
      { label: 'Sélecteur de générations', text: 'Ajustez la profondeur de 4 à 7 générations pour observer l\'ascendance complète.' },
      { label: 'Détection de l\'implexe', text: 'Les ancêtres apparaissant sur plusieurs branches sont surlignés en ambre doré.' },
      { label: 'Vue Sablier', text: 'Basculez sur l\'onglet Sablier pour voir simultanément les parents et la descendance directe.' }
    ]
  },
  descendants: {
    title: 'Arbre de Descendance Repliable d\'Aboville',
    badge: 'Numérotation d\'Aboville',
    icon: <GitFork className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />,
    summary: 'Arbre descendant hiérarchique avec cotation d\'Aboville (1, 1.1, 1.2, 1.1.1...) pour chaque enfant et génération successive.',
    tips: [
      { label: 'Déplier / Replier', text: 'Cliquez sur les flèches pour inspecter chaque branche ou utilisez les boutons Tout déplier.' },
      { label: 'Branches éteintes', text: 'Repérez immédiatement les branches sans postérité connue.' }
    ]
  },
  implex: {
    title: 'Calculateur d\'Implexe & Taux d\'Endogamie',
    badge: 'Analyse d\'endogamie',
    icon: <Sparkles className="w-4 h-4 text-amber-700 dark:text-amber-400" />,
    summary: 'Mesurez la perte d\'ancêtres théoriques et le taux d\'endogamie par génération dû aux mariages consanguins ou entre cousins.',
    tips: [
      { label: 'Taux global', text: 'Pourcentage des cases Sosa redondantes parmi les ancêtres réels.' },
      { label: 'Multi-occurrences', text: 'Retrouvez les ancêtres communs qui figurent sur plusieurs branches de la famille.' }
    ]
  },
  validation: {
    title: 'Contrôle Qualité & Détection d\'Incohérences',
    badge: 'Fiabilité des données',
    icon: <Info className="w-4 h-4 text-red-700 dark:text-red-400" />,
    summary: 'Détectez automatiquement les cycles généalogiques impossibles, les décès avant naissance, et suivez la complétude de vos fiches.',
    tips: [
      { label: 'Cycles', text: 'Vérifie qu\'aucun ancêtre n\'apparaît dans sa propre descendance par erreur de liaison.' },
      { label: 'Score de complétude', text: 'Mesure le taux de renseignement des dates, lieux, professions et filiations.' }
    ]
  },
  compare: {
    title: 'Comparateur de Fiches Individuelles',
    badge: 'Analyse différentielle',
    icon: <Users className="w-4 h-4 text-indigo-700 dark:text-indigo-400" />,
    summary: 'Mettez deux personnes côte à côte pour détecter les doublons potentiels, démêler les homonymes ou vérifier des cousinages.',
    tips: [
      { label: 'Recherche rapide', text: 'Sélectionnez la deuxième personne avec le moteur de recherche instantané.' },
      { label: 'Champs identiques', text: 'Les critères parfaitement concordants sont immédiatement mis en évidence en vert.' }
    ]
  },
  graph: {
    title: 'Graphe Relationnel D3 & Physique Interactive',
    badge: 'Réseau relationnel',
    icon: <Sparkles className="w-4 h-4 text-indigo-700 dark:text-indigo-400" />,
    summary: 'Explorez votre famille comme un réseau organique propulsé par une simulation de physique de forces D3.',
    tips: [
      { label: 'Filtres de liens', text: 'Isolez les liens de filiation directe (parents-enfants) ou les liens de mariages.' },
      { label: 'Interactivité', text: 'Glissez les nœuds pour réorganiser le graphe et double-cliquez pour recentrer.' }
    ]
  }
};

interface ContextualGuideProps {
  screen: ActiveTab;
}

export const ContextualGuide: React.FC<ContextualGuideProps> = ({ screen }) => {
  const [isEnabled, setIsEnabled] = useState(areContextGuidesEnabled());
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(`${STORAGE_KEY_COLLAPSED_PREFIX}${screen}`) === 'true';
  });

  useEffect(() => {
    const handleToggle = () => setIsEnabled(areContextGuidesEnabled());
    window.addEventListener('genealogor:guides-toggle', handleToggle);
    return () => window.removeEventListener('genealogor:guides-toggle', handleToggle);
  }, []);

  const toggleCollapsed = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    try {
      localStorage.setItem(`${STORAGE_KEY_COLLAPSED_PREFIX}${screen}`, String(next));
    } catch (e) {}
  };

  const handleDismissPermanently = () => {
    setContextGuidesEnabled(false);
  };

  if (!isEnabled) return null;

  const guide = GUIDES_DATA[screen];
  if (!guide) return null;

  return (
    <div className="mx-4 md:mx-8 mt-3 mb-1">
      <div className="bg-amber-50/70 dark:bg-[#181B22] border border-amber-200/80 dark:border-amber-900/30 rounded-xl overflow-hidden shadow-2xs transition-all">
        
        {/* Banner Bar Header */}
        <div className="px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 shrink-0">
              {guide.icon}
            </div>
            <div className="truncate">
              <div className="flex items-center gap-2">
                <span className="font-serif font-bold text-xs text-amber-950 dark:text-amber-200 truncate">
                  {guide.title}
                </span>
                <span className="hidden sm:inline-block px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-amber-200/60 dark:bg-amber-900/40 text-amber-900 dark:text-amber-300">
                  {guide.badge}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={toggleCollapsed}
              className="px-2 py-1 text-[11px] font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 rounded flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>{isCollapsed ? 'Afficher le guide' : 'Réduire'}</span>
              {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={handleDismissPermanently}
              title="Masquer les guides d'écran (réactivable dans Paramètres Système)"
              className="p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Expandable Tips */}
        {!isCollapsed && (
          <div className="px-4 pb-3 pt-1 border-t border-amber-200/50 dark:border-amber-900/20 text-xs">
            <p className="text-stone-600 dark:text-stone-400 mb-2 leading-relaxed">
              {guide.summary}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {guide.tips.map((tip, idx) => (
                <div key={idx} className="p-2 rounded-lg bg-white/60 dark:bg-stone-900/40 border border-amber-100 dark:border-stone-800 text-[11px]">
                  <span className="font-semibold text-amber-900 dark:text-amber-300 block mb-0.5">
                    💡 {tip.label}
                  </span>
                  <span className="text-stone-600 dark:text-stone-400 leading-snug">
                    {tip.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
