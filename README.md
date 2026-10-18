# Démarche pas à pas

Une application web pour **voir ce que fait un algorithme**, étape par étape : les cases
d'une liste s'allument quand elles sont lues, les variables changent sous nos yeux, chaque
condition est écrite avec ses valeurs et son booléen surligné (« x > m ⟶ 12 > 4 : True »), et la
phrase de la démarche correspondant à la ligne exécutée s'affiche au-dessus de l'animation.

Pensée pour la NSI (1re et Terminale). L'élève peut écrire sa **démarche en français** : elle est
traduite en Python par Claude, sans être corrigée, puis animée. On peut aussi écrire directement
du Python.

## Utiliser l'application

- **Sans rien installer** : ouvrir `dist/demarche.html` dans un navigateur (double-clic).
  Le fichier est autonome : il fonctionne hors connexion (seules les polices viennent
  d'Internet ; sans connexion, des polices du système les remplacent).
- Deux onglets : **Démarche** (en français, une instruction par ligne) et **Python**. Choisir un
  exemple dans la liste, ou écrire son propre texte, puis **Traduire et exécuter** ou **Exécuter**
  (ou Ctrl + Entrée).
- Le bouton **Pas à pas** (ou les touches → et Espace) exécute une étape à la fois ; **Étape
  précédente** (ou ←) revient en arrière. Il n'y a pas de lecture automatique : c'est l'élève qui
  avance. **Exécuter** recommence depuis le début.
- Un lien peut ouvrir directement un exemple : `demarche.html#tri-insertion`.

### La démarche en français

L'onglet **Démarche** reçoit le texte de l'élève, une instruction par ligne, éventuellement mêlé
de Python :

```
L = [4,12,7,2,33]
m = L[0]
parcours la liste L
chaque fois que la valeur x rencontrée est supérieure à m, cela devient la nouvelle valeur de m
```

**Traduire et exécuter** demande à Claude une traduction littérale en Python, puis l'animation
démarre. La phrase de l'élève en cours d'exécution est surlignée dans son texte et affichée sur la
scène ; la traduction en Python est visible à côté, avec les **hypothèses** de traduction
(« « cela » désigne la valeur x »). La consigne donnée à Claude (`src/translate/prompt.js`) lui
interdit de corriger ou de compléter : une valeur de départ oubliée reste oubliée, et c'est
l'animation qui montre l'erreur.

- La traduction utilise **le compte Claude de la personne qui ouvre la page**, dans la version en
  ligne publiée sur claude.ai : elle accepte au premier usage. Dans le fichier `dist/demarche.html`
  ouvert hors ligne, l'onglet Démarche l'explique et seul l'onglet Python fonctionne.
- Une démarche déjà traduite est gardée dans le navigateur : la même démarche donne toujours la
  même traduction, sans nouvel appel. **Retraduire** en demande une nouvelle.
- **Ouvrir ce code dans l'onglet Python** permet de reprendre la traduction et de la modifier.
- La réponse de Claude est vérifiée avant d'être exécutée : forme attendue, puis analyse du Python
  produit par l'interpréteur de l'application.

### Les commentaires sont les phrases de la démarche

```python
L = [4, 12, 7, 2, 33]
m = L[0]
for x in L:       # parcours la liste L
    if x > m:     # chaque fois que la valeur x rencontrée est supérieure à m,
        m = x     # cela devient la nouvelle valeur de m
```

Quand une ligne s'exécute, son commentaire (ou les commentaires placés juste au-dessus)
s'affiche en grand au-dessus de l'animation (la zone garde la même hauteur à chaque étape, même
pour les lignes sans commentaire). C'est aussi la forme du Python produit par la traduction.

### Ce que montre l'animation

- chaque liste sous forme de cases numérotées ; la case lue s'allume (jaune), les cases
  comparées sont entourées (bleu), les cases modifiées passent en vert et les valeurs se
  déplacent : d'une case à l'autre (`L[i] = L[j]`), d'une case vers une variable (`temp = L[i]`)
  et retour (`L[j] = temp`) ;
- les variables utilisées comme indices (`i`, `j`, `imin`, `milieu`…) apparaissent comme des
  flèches sous les cases ; la variable d'une boucle `for x in L` suit l'élément visité ;
- pour une recherche dichotomique (`debut` / `fin`, `gauche` / `droite`…), les cases hors de la
  zone de recherche sont grisées ;
- chaque condition évaluée, avec ses valeurs et son booléen surligné, puis sa conséquence :
  `x > m ⟶ 4 > 4 : False`, « donc on saute le bloc du if ». Pour une condition composée
  (`i < len(L) and L[i] != v`), chaque comparaison est détaillée avant la condition entière ;
- les variables, les appels de fonctions en cours, ce qui est affiché par `print` ;
- les erreurs, expliquées en français, avec l'état du programme au moment de l'erreur (une case
  fantôme rouge montre l'indice qui dépasse de la liste). Une boucle qui ne s'arrête pas est
  interrompue au bout de 10 000 étapes.

L'animation montre ce que le programme fait réellement, pas ce qu'il était censé faire : les
exemples « Démarches à corriger » s'appuient là-dessus.

## Le Python pris en charge

Un sous-ensemble de Python 3 exécuté dans le navigateur, qui couvre les algorithmes du programme :

- entiers (sans limite de taille), flottants, booléens, chaînes, `None`, listes, tuples, dictionnaires ;
- affectations d'une seule variable à la fois : `a, b = b, a` et `a = b = 0` sont refusés avec une
  explication ; un échange s'écrit en trois lignes, avec une variable temporaire
  (`temp = L[i]`, `L[i] = L[j]`, `L[j] = temp`) ;
- `if` / `elif` / `else`, `while`, `for`, `break`, `continue`, `pass`, `assert`, `del`, `global` ;
- fonctions (`def`, paramètres par défaut, arguments nommés, récursivité, `lambda`) ;
- listes en compréhension, tranches `L[a:b]`, f-strings et `format` ;
- fonctions usuelles (`len`, `range`, `print`, `input`, `min`, `max`, `sum`, `sorted`, `round`…),
  méthodes des listes et des chaînes, modules `math`, `random` et `time`.

Non pris en charge pour l'instant : classes, exceptions (`try`), générateurs (`yield`),
ensembles (`set`), modules autres que ceux cités. Le programme le signale clairement.

`input()` lit les valeurs du champ « Entrées », qui apparaît quand le programme utilise `input`.

## Pour les développeurs

```
src/python/   tokenizer.js, parser.js  → analyse du programme
              interpreter.js           → exécution et enregistrement de la trace
              values.js, builtins.js   → valeurs Python, fonctions et modules
src/translate/ prompt.js (consigne), assemble.js (contrôle de la réponse), claude.js (appel à Claude)
src/ui/       app.js (point d'entrée), stage.js (scène), narration.js, editor.js, player.js, examples.js
src/style.css
index.html    page de développement (modules JS, nécessite un petit serveur)
dist/         demarche.html, fichier autonome produit par la construction
tests/        tests (node:test)
```

```sh
npm install        # installe esbuild (seule dépendance, pour la construction)
npm test           # tests ; ceux qui comparent avec le vrai Python 3 sont ignorés s'il est absent
npm run build      # produit dist/demarche.html
npm run dev        # sert le dossier sur http://localhost:8080 (index.html)
```

L'interpréteur exécute tout le programme d'un coup et enregistre une **trace** : pour chaque
étape, la ligne exécutée, les événements (lecture d'une case, comparaison, affectation,
échange, appel…) et un instantané des variables et des listes. L'animation ne fait que rejouer
cette trace, étape par étape, en avant comme en arrière.

Les tests différentiels exécutent un corpus de programmes (et d'erreurs) à la fois avec le vrai
Python 3 et avec l'interpréteur, et vérifient que les affichages et les types d'erreur sont identiques.

## Feuille de route

1. **Moteur et animations** : tableaux, parcours, recherches, tris, glouton. Fait.
2. **Traduction de la démarche** : Claude traduit la démarche rédigée par l'élève en Python
   restreint commenté (une ligne de démarche ↔ une ou plusieurs lignes de code), sans la corriger,
   en signalant ses hypothèses. Première version faite, à éprouver avec de vraies démarches
   d'élèves ; pour des élèves sans compte Claude, il faudra un petit serveur avec une clé d'API.
3. **Autonomie** : selon les besoins (données, coût, réseau), un petit modèle spécialisé hébergé
   localement ou dans le navigateur.

D'autres vues viendront pour la Terminale : piles et files, arbres, graphes, pile des appels récursifs.
