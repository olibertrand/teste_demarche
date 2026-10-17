# Démarche pas à pas

Une application web pour **voir ce que fait un algorithme**, étape par étape : les cases
d'une liste s'allument quand elles sont lues, les variables changent sous nos yeux, chaque
condition est écrite avec ses valeurs et son booléen surligné (« x > m ⟶ 12 > 4 : True »), et la
phrase de la démarche correspondant à la ligne exécutée s'affiche au-dessus de l'animation.

Pensée pour la NSI (1re et Terminale). Ce dépôt correspond à l'**étape 1** du projet :
le moteur d'exécution et les animations, alimentés par du Python écrit à la main.
L'étape 2 ajoutera la traduction d'une démarche rédigée en français vers ce Python.

## Utiliser l'application

- **Sans rien installer** : ouvrir `dist/demarche.html` dans un navigateur (double-clic).
  Le fichier est autonome : il fonctionne hors connexion (seules les polices viennent
  d'Internet ; sans connexion, des polices du système les remplacent).
- Choisir un exemple dans la liste, ou cliquer sur **Modifier** pour écrire son propre programme,
  puis **Exécuter** (ou Ctrl + Entrée).
- Le bouton **Pas à pas** (ou les touches → et Espace) exécute une étape à la fois. Il n'y a pas
  de lecture automatique : c'est l'élève qui avance. **Exécuter** recommence depuis le début.
- Un lien peut ouvrir directement un exemple : `demarche.html#tri-insertion`.

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
pour les lignes sans commentaire). C'est ce format que produira la traduction automatique de l'étape 2.

### Ce que montre l'animation

- chaque liste sous forme de cases numérotées ; la case lue s'allume (jaune), les cases
  comparées sont entourées (bleu), les cases modifiées passent en vert, les échanges en rose
  et les valeurs se déplacent ;
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
cette trace, étape par étape.

Les tests différentiels exécutent un corpus de programmes (et d'erreurs) à la fois avec le vrai
Python 3 et avec l'interpréteur, et vérifient que les affichages et les types d'erreur sont identiques.

## Feuille de route

1. **Moteur et animations** (ce dépôt) : tableaux, parcours, recherches, tris, glouton.
2. **Traduction de la démarche** : un modèle de langage traduit la démarche rédigée par l'élève en
   Python restreint commenté (une ligne de démarche ↔ une ou plusieurs lignes de code), sans la
   corriger, en signalant ses hypothèses.
3. **Autonomie** : selon les besoins (données, coût, réseau), un petit modèle spécialisé hébergé
   localement ou dans le navigateur.

D'autres vues viendront pour la Terminale : piles et files, arbres, graphes, pile des appels récursifs.
