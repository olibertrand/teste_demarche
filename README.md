# Démarche pas à pas

Une application web pour **voir ce que fait un algorithme**, étape par étape : les cases
d'une liste s'allument quand elles sont lues, les variables changent sous nos yeux, chaque
condition est écrite avec ses valeurs et son booléen surligné (« x > m ⟶ 12 > 4 : True »), et la
phrase de la démarche correspondant à la ligne exécutée s'affiche au-dessus de l'animation.

Pensée pour la NSI (1re et Terminale). L'élève peut écrire sa **démarche en français**, en
pseudo-code : elle est traduite en Python dans le navigateur, sans IA, sans connexion et sans
compte, sans être corrigée, puis animée. On peut aussi écrire directement du Python.

## Utiliser l'application

- **Sans rien installer** : ouvrir `dist/demarche.html` dans un navigateur (double-clic).
  Le fichier est autonome, polices comprises : il fonctionne hors connexion et ne fait aucune
  requête vers Internet.
- Deux onglets : **Démarche** (en français, une instruction par ligne) et **Python**. Choisir un
  exemple dans la liste, ou écrire son propre texte, puis **Traduire et exécuter** ou **Exécuter**
  (ou Ctrl + Entrée).
- Le bouton **Pas à pas** (ou les touches → et Espace) exécute une étape à la fois ; **Étape
  précédente** (ou ←) revient en arrière. Il n'y a pas de lecture automatique : c'est l'élève qui
  avance. **Exécuter** recommence depuis le début.
- Un lien peut ouvrir directement un exemple : `demarche.html#tri-insertion`.
- Le menu **Écriture** choisit l'écriture « à la main » des phrases de la démarche : Playpen Sans
  (par défaut), Delius ou Comic Neue. Le choix est gardé dans le navigateur.
- **Enregistrer la démarche** (ou Ctrl + S) la met dans un fichier texte daté
  (`demarche-2026-11-05-14h32.txt`) ; **Ouvrir une démarche…** la recharge, traduite et animée.
  L'onglet Python fait de même avec des fichiers `.py`. Un élève peut ainsi garder son travail
  d'une séance à l'autre, ou le rendre (sur l'ENT, par exemple). Le texte en cours survit à un
  rechargement de la page, pas à une nouvelle ouverture du fichier : sur un ordinateur partagé,
  chacun repart des exemples. L'écriture choisie, elle, est gardée.

### Pour le professeur : les exemples proposés aux élèves

**Mode professeur : choisir les exemples**, en bas de la page, règle ce que voient les élèves :
- ce qui s'affiche à l'ouverture de la page, dans chaque onglet : un exemple (« Maximum » au
  départ), ou un cahier vide (un éditeur vide pour Python), pour que l'élève parte de sa propre
  démarche ;
- les exemples du menu : on coche ceux qu'ils verront, et les flèches ↑ ↓ changent leur ordre dans
  leur groupe (**Ordre d'origine** le remet). Les tris, la recherche dichotomique et le rendu de
  monnaie sont cachés au départ.

**Enregistrer une version pour les élèves** produit le fichier `demarche-eleves.html`, autonome,
qui garde ces choix : c'est lui qu'on donne aux élèves (ENT, clé
USB). Pour changer le choix plus tard, on rouvre ce fichier et on l'enregistre de nouveau. Cette
version ne peut être préparée que depuis le fichier autonome, pas depuis la version en ligne.

### La démarche en français

L'onglet **Démarche** reçoit le texte de l'élève, un pseudo-code en français, éventuellement mêlé
de Python :

```
L = [4, 12, 7, 2, 33]
m <- L[0]
pour chaque élément x de la liste L :
    si x > m alors m prend la valeur x
affiche m
```

**Traduire et exécuter** traduit la démarche en Python (`src/translate/pseudo.js`), puis
l'animation démarre. La phrase en cours d'exécution est surlignée dans le texte de l'élève et
affichée sur la scène ; la traduction en Python est visible à côté, avec les **hypothèses** de
traduction (« « cela » : j'ai compris x »).

- **Conventions** : pour donner une valeur, `<-`, `←`, `=` ou « prend la valeur » (aussi « reçoit »,
  « devient », « est la nouvelle valeur de ») ; ce qui se répète ou dépend d'un « si » se décale vers
  la droite (l'indentation fait les blocs, comme en Python) ; « de 0 à 4 » compte 0 et 4 ;
  plusieurs instructions peuvent se suivre sur une ligne, séparées par des points.
- **Tournures comprises** : parcours des valeurs ou des indices (« pour chaque élément x de la
  liste L », « parcours la liste L avec la variable x », « pour chaque indice i de L », « pour i
  allant de 0 à 4 »), « tant que », « si … alors … », « sinon », « à chaque fois que… » ;
  conditions en symboles ou en mots (« est supérieur à », « vaut », « est pair », « on trouve 5 ») ;
  « afficher », « ajouter 1 au compteur », « ajouter x à la fin de L », « échanger L[i] et L[j] »
  (en trois lignes, avec temp), « renvoyer » ; « le premier élément de L », « la longueur de L »,
  « l'élément d'indice i de L » ; la puissance (`2**n`, `2^n`, « 2 puissance n », « n au carré »,
  `n²`). Majuscules et accents sont indifférents.
- **Des questions quand il manque quelque chose** : le nom d'une liste, la variable d'un parcours,
  les valeurs pour essayer, ou une phrase à répéter qui n'est pas décalée. L'élève clique une
  réponse proposée ou écrit la sienne ; **sa réponse complète sa démarche** (« parcours la liste L »
  devient « parcours la liste L avec la variable x »), qui devient explicite.
- **Rien n'est corrigé** : une valeur de départ oubliée reste oubliée, et c'est l'animation qui
  montre l'erreur. Une démarche qui « renvoie » un résultat devient une fonction, appelée avec les
  valeurs données.
- **Ce qui n'est pas compris est signalé**, avec la phrase en cause sélectionnée dans le texte :
  « on recommence… », « et ainsi de suite », ou échanger l'élément rencontré pendant un parcours
  des valeurs (il faut sa position : parcourir les indices). Dans la version en ligne sur
  claude.ai, **Demander à Claude** propose alors une traduction par Claude, avec le compte de la
  personne qui ouvre la page (consigne : `src/translate/prompt.js`, contrôle de la réponse :
  `src/translate/assemble.js`) ; **Retraduire** en demande une nouvelle.
- Après chaque traduction, l'onglet **Python** contient le code traduit, déjà exécuté : on peut y
  suivre la même animation (les deux onglets restent à la même étape) ou modifier le code. Le
  programme qui s'y trouvait est remplacé ; à l'ouverture de la page, en revanche, l'onglet Python
  garde ce qu'on y avait laissé. **Ouvrir ce code dans l'onglet Python** y remet la traduction si
  on l'a modifiée entre-temps.

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
  déplacent : d'une case à l'autre, dans la même liste (`L[i] = L[j]`) ou d'une liste à une autre
  (`R[k] = L[i]`), d'une case vers une variable (`temp = L[i]`) et retour (`L[j] = temp`), d'une
  variable à l'autre (`m = x`), et vers la case ajoutée par `R.append(x)`, `R.append(L[i])` ou
  `R.insert(k, x)`. Une valeur calculée (`m = x + 1`, `R.append(2 * x)`) ne voyage pas : elle
  apparaît à sa place ;
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
- `if` / `elif` / `else`, `while`, `for`, `pass`, `assert`, `del`, `global` ;
- ni `break`, ni `continue`, ni `else` après une boucle : ils sont refusés avec une explication.
  Une boucle s'arrête quand sa condition le dit (`while i < len(L) and L[i] != v`), et un `if`
  dit quels éléments traiter. `return` reste permis, même à l'intérieur d'une boucle ;
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
src/translate/ pseudo.js (traduction du pseudo-code, questions), et pour le secours par Claude :
              prompt.js (consigne), assemble.js (contrôle de la réponse), claude.js (appel à Claude)
src/ui/       app.js (point d'entrée), stage.js (scène), narration.js, editor.js, player.js, examples.js,
              handwriting.js (écritures du menu « Écriture »), files.js (enregistrer un fichier)
src/style.css
src/fonts/    polices stockées avec l'application (licence SIL OFL), voir LISEZMOI.md
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
2. **Traduction de la démarche par Claude** : dans la version en ligne, avec un compte Claude.
   Fait ; c'est maintenant le secours pour les phrases que les règles ne comprennent pas.
3. **Traduction sans IA, pour les élèves** : un pseudo-code français au vocabulaire restreint,
   traduit par des règles dans le navigateur, avec des questions quand il manque quelque chose.
   Première version faite, à éprouver avec de vraies démarches d'élèves ; à venir : des phrases
   modèles à insérer, et plus de tournures. Les démarches recueillies pourraient servir plus tard
   à entraîner un petit modèle.

D'autres vues viendront pour la Terminale : piles et files, arbres, graphes, pile des appels récursifs.
