// Exemples proposés dans l'application. Les commentaires jouent le rôle des phrases de la
// démarche : quand une ligne s'exécute, son commentaire s'affiche au-dessus de l'animation.
// hidden: true : pas encore montré aux élèves ; le professeur choisit les exemples affichés
// (« Mode professeur »), et ce choix est enregistré dans la version pour les élèves.

export const EXAMPLES = [
  {
    id: 'parcours',
    group: 'Parcourir une liste',
    title: 'Parcours simple',
    code: `L = [4, 12, 7, 2, 33]
for x in L:   # parcours la liste L
    pass
`,
  },
  {
    id: 'maximum',
    group: 'Parcourir une liste',
    title: 'Maximum',
    code: `L = [4, 12, 7, 2, 33]
m = L[0]
for x in L:       # parcours la liste L
    if x > m:     # chaque fois que la valeur x rencontrée est supérieure à m,
        m = x     # cela devient la nouvelle valeur de m
`,
  },
  {
    id: 'minimum-indice',
    group: 'Parcourir une liste',
    title: 'Minimum et sa position',
    code: `L = [9, 4, 12, 2, 7, 5]
imin = 0
for i in range(1, len(L)):   # pour chaque indice i à partir de 1
    if L[i] < L[imin]:       # si l'élément d'indice i est plus petit que le minimum actuel
        imin = i             # on retient sa position
print("minimum :", L[imin], "à l'indice", imin)
`,
  },
  {
    id: 'moyenne',
    group: 'Parcourir une liste',
    title: 'Moyenne',
    code: `notes = [12, 15, 8, 17, 10]
s = 0
for n in notes:   # on parcourt les notes
    s = s + n     # en les additionnant une à une
moyenne = s / len(notes)
print(moyenne)
`,
  },
  {
    id: 'comptage',
    group: 'Parcourir une liste',
    title: 'Compter les occurrences',
    code: `L = [3, 1, 3, 2, 3, 1]
nb = 0
for x in L:          # parcours la liste L
    if x == 3:       # chaque fois qu'on rencontre 3,
        nb = nb + 1  # on augmente le compteur
print(nb)
`,
  },
  {
    id: 'appartient',
    group: 'Rechercher',
    title: 'Recherche d’une valeur',
    code: `def appartient(v, L):
    for x in L:          # parcours la liste L
        if x == v:       # dès qu'on trouve v,
            return True  # on s'arrête : v est dans la liste
    return False         # liste parcourue en entier sans trouver v

L = [5, 3, 8, 1, 9]
print(appartient(8, L))
print(appartient(4, L))
`,
  },
  {
    id: 'recherche-while',
    group: 'Rechercher',
    title: 'Première position (boucle while)',
    code: `L = [5, 3, 8, 1, 9]
v = 8
i = 0
while i < len(L) and L[i] != v:   # tant qu'on n'est pas au bout et qu'on n'a pas trouvé v
    i = i + 1                     # on avance d'une case
if i < len(L):
    print(v, "est à l'indice", i)
else:
    print(v, "n'est pas dans la liste")
`,
  },
  {
    id: 'dichotomie',
    hidden: true,
    group: 'Rechercher',
    title: 'Recherche dichotomique',
    code: `def dichotomie(L, v):
    debut = 0
    fin = len(L) - 1
    while debut <= fin:               # tant que la zone de recherche n'est pas vide
        milieu = (debut + fin) // 2   # on regarde l'élément du milieu
        if L[milieu] == v:
            return milieu             # trouvé !
        elif L[milieu] < v:
            debut = milieu + 1        # v ne peut être que dans la moitié droite
        else:
            fin = milieu - 1          # v ne peut être que dans la moitié gauche
    return None                       # zone vide : v n'est pas dans la liste

L = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]
print(dichotomie(L, 23))
`,
  },
  {
    id: 'tri-selection',
    hidden: true,
    group: 'Trier',
    title: 'Tri par sélection',
    code: `def tri_selection(T):
    n = len(T)
    for i in range(n - 1):
        imin = i                        # on cherche le minimum de la partie non triée
        for j in range(i + 1, n):
            if T[j] < T[imin]:
                imin = j
        temp = T[i]                     # on garde T[i] de côté
        T[i] = T[imin]                  # on met le minimum en position i
        T[imin] = temp                  # et l'ancien T[i] à la place du minimum

L = [7, 3, 9, 1, 5, 2]
tri_selection(L)
print(L)
`,
  },
  {
    id: 'tri-insertion',
    hidden: true,
    group: 'Trier',
    title: 'Tri par insertion',
    code: `def tri_insertion(T):
    for i in range(1, len(T)):
        cle = T[i]                        # l'élément à insérer
        j = i
        while j > 0 and T[j - 1] > cle:   # on décale vers la droite les éléments plus grands
            T[j] = T[j - 1]
            j = j - 1
        T[j] = cle                        # on insère cle à sa place

L = [7, 3, 9, 1, 5, 2]
tri_insertion(L)
print(L)
`,
  },
  {
    id: 'fusion',
    hidden: true,
    group: 'Trier',
    title: 'Fusion de deux listes triées',
    code: `A = [2, 7, 12]
B = [3, 4, 15, 20]
R = []
i = 0
j = 0
while i < len(A) and j < len(B):   # tant qu'aucune des deux listes n'est épuisée
    if A[i] <= B[j]:               # on prend le plus petit des deux premiers restants
        R.append(A[i])
        i = i + 1
    else:
        R.append(B[j])
        j = j + 1
while i < len(A):                  # on recopie la fin de A
    R.append(A[i])
    i = i + 1
while j < len(B):                  # puis la fin de B
    R.append(B[j])
    j = j + 1
print(R)
`,
  },
  {
    id: 'rendu-monnaie',
    hidden: true,
    group: 'Algorithme glouton',
    title: 'Rendu de monnaie',
    code: `pieces = [200, 100, 50, 20, 10, 5, 2, 1]
somme = 263
rendu = []
for p in pieces:          # des plus grosses pièces aux plus petites
    while somme >= p:     # tant que la pièce p ne dépasse pas ce qu'il reste à rendre,
        rendu.append(p)   # on la rend
        somme = somme - p
print(rendu)
`,
  },
  {
    id: 'oubli-initialisation',
    group: 'Démarches à corriger',
    title: 'm n’a pas de valeur de départ',
    code: `L = [4, 12, 7, 2, 33]
for x in L:       # parcours la liste L
    if x > m:     # chaque fois que la valeur x rencontrée est supérieure à m,
        m = x     # cela devient la nouvelle valeur de m
`,
  },
  {
    id: 'maximum-zero',
    group: 'Démarches à corriger',
    title: 'm commence à 0',
    code: `L = [-4, -12, -7, -2, -33]
m = 0
for x in L:       # parcours la liste L
    if x > m:     # chaque fois que x est supérieure à m,
        m = x     # cela devient la nouvelle valeur de m
print(m)          # est-ce vraiment le maximum de L ?
`,
  },
  {
    id: 'indice-de-trop',
    group: 'Démarches à corriger',
    title: 'Un indice de trop',
    code: `L = [4, 12, 7, 2, 33]
for i in range(len(L)):    # pour chaque indice i de la liste
    if L[i] > L[i + 1]:    # on compare l'élément au suivant
        print(L[i], "est plus grand que", L[i + 1])
`,
  },
  {
    id: 'boucle-infinie',
    group: 'Démarches à corriger',
    title: 'La boucle qui ne s’arrête pas',
    code: `L = [5, 3, 8, 1, 9]
v = 8
i = 0
while L[i] != v:       # tant qu'on n'a pas trouvé v
    suivant = i + 1    # on calcule l'indice suivant… mais i ne change jamais
`,
  },
];

export const DEFAULT_EXAMPLE = 'maximum';

// Démarches en français, telles que les écrivent les élèves : traduites en Python dans le
// navigateur. Certaines sont incomplètes (une question s'affiche) ou à corriger (l'animation le montre).
export const DEMARCHE_EXAMPLES = [
  {
    id: 'demarche-parcours',
    title: 'Parcours d’une liste',
    text: `L = [4, 12, 7, 2, 33]
parcours la liste L
`,
  },
  {
    id: 'demarche-maximum',
    title: 'Maximum',
    text: `L = [4, 12, 7, 2, 33]
m <- L[0]
pour chaque élément x de la liste L :
    si x > m alors m prend la valeur x
affiche m
`,
  },
  {
    id: 'demarche-compter',
    title: 'Compter les 5',
    text: `compteur <- 0. pour chaque élément x de la liste L, si x est égal à 5, ajoute 1 au compteur
`,
  },
  {
    id: 'demarche-somme',
    title: 'Somme et moyenne',
    text: `notes = [12, 15, 8, 17, 10]
s ← 0
pour chaque note n de la liste notes :
    ajoute n à s
moyenne = s / la longueur de notes
affiche moyenne
`,
  },
  {
    id: 'demarche-pairs',
    title: 'Compter les nombres pairs',
    text: `L = [3, 8, 6, 1, 4]
c = 0
pour chaque élément x de L :
    si x est pair, augmente c de 1
affiche c
`,
  },
  {
    id: 'demarche-appartient',
    title: 'La valeur est-elle dans la liste ?',
    text: `regarde chaque élément de la liste. Si l'élément vaut x, renvoie True. Si après avoir vu toute la liste on n'a pas trouvé x, renvoie False
`,
  },
  {
    id: 'demarche-recherche',
    title: 'Position d’une valeur (tant que)',
    text: `L = [5, 3, 8, 1, 9]
v <- 8
i <- 0
tant que l'élément d'indice i de L n'est pas v :
    on passe à l'indice suivant
affiche i
`,
  },
  {
    id: 'demarche-bulles',
    hidden: true,
    title: 'Une passe du tri à bulles',
    text: `T = [7, 3, 9, 1]
pour i allant de 0 à len(T) - 2 :
    si T[i] > T[i + 1] alors échange T[i] et T[i + 1]
affiche T
`,
  },
  {
    id: 'demarche-compter-sans-depart',
    title: 'Compter, sans valeur de départ (à corriger)',
    text: `parcourir la liste. A chaque fois qu'on trouve 5, ajoute 1 au compteur.
`,
  },
  {
    id: 'demarche-max-indices',
    title: 'Maximum par les indices (à corriger)',
    text: `pour chaque indice i de L: si L[i] > max alors L[I] est la nouvelle valeur de max
`,
  },
];

export const DEFAULT_DEMARCHE = 'demarche-maximum';
