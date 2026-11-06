# Mettre la version pour les élèves en ligne (demarche.jeangi.org)

La version pour les élèves (`demarche-eleves.html`) est **un seul fichier, complet** : le
programme, les styles et les polices sont dedans, et la page ne fait aucune requête vers un autre
site. Un serveur web n'a donc qu'à le servir tel quel : pas de base de données, pas de PHP, rien
d'autre à installer.

Il y a deux parties :
- **une seule fois**, préparer le serveur : le nom, le dossier, le serveur web, le HTTPS ;
- **à chaque nouvelle version**, déposer le fichier.

Dans les commandes, `prof@ADRESSE-DU-VPS` n'est qu'un exemple. Écris à la place **exactement ce
que tu tapes après `ssh`** pour te connecter au VPS : par exemple `debian@203.0.113.10`, ou le
nom court défini dans ta configuration SSH.

## Une seule fois : préparer le serveur

### 1. Le nom demarche.jeangi.org

Chez le fournisseur du domaine jeangi.org (OVH, Gandi, Cloudflare…), dans la **zone DNS**,
ajoute l'enregistrement suivant :

| Type | Nom (sous-domaine) | Valeur |
| --- | --- | --- |
| `A` | `demarche` | l'adresse IPv4 du VPS |

Si le VPS a aussi une adresse IPv6, ajoute de même un enregistrement `AAAA`. Autre solution : si
`jeangi.org` désigne déjà ce VPS, un enregistrement `CNAME` `demarche` → `jeangi.org.` suffit.

Le nom est pris en compte au bout de quelques minutes, parfois quelques heures. Pour vérifier,
lance `nslookup demarche.jeangi.org` sur ton ordinateur : la commande doit afficher l'adresse du
VPS.

### 2. Le dossier du site

Sur le VPS, en SSH, connecté avec le compte qui déposera le fichier. Ne passe pas en root
avant (pas de `sudo -i` ni de `sudo su`) :

```sh
sudo mkdir -p /var/www/demarche
sudo chown -R "$USER": /var/www/demarche
ls -la /var/www/demarche
```

La dernière commande doit montrer ton compte comme propriétaire du dossier, et aussi de
`index.html` s'il existe déjà. Ton compte peut ensuite y déposer le fichier sans `sudo`.
N'y crée pas de fichier avec `sudo` : il appartiendrait à root, et le dépôt suivant serait refusé.

### 3. Le serveur web

Pour savoir lequel est installé, lance `nginx -v`, `apache2 -v` ou `caddy version` : celle qui
répond donne le serveur. Suis ensuite la partie correspondante.

#### nginx

Crée le fichier `/etc/nginx/sites-available/demarche.jeangi.org`, par exemple avec
`sudo nano /etc/nginx/sites-available/demarche.jeangi.org` :

```nginx
server {
    listen 80;
    listen [::]:80;    # à retirer si le VPS n'a pas d'IPv6 (voir « En cas de souci »)
    server_name demarche.jeangi.org;
    root /var/www/demarche;
    index index.html;
    charset utf-8;

    location / {
        try_files $uri $uri/ =404;
        # à chaque nouvelle version, le navigateur vérifie qu'il a la dernière
        add_header Cache-Control "no-cache";
    }
}
```

Active-le :

```sh
sudo ln -s /etc/nginx/sites-available/demarche.jeangi.org /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Puis active le HTTPS, avec un certificat Let's Encrypt gratuit et renouvelé automatiquement :

```sh
sudo apt install certbot python3-certbot-nginx    # si certbot n'est pas déjà installé
sudo certbot --nginx -d demarche.jeangi.org
```

#### Apache

Crée le fichier `/etc/apache2/sites-available/demarche.jeangi.org.conf` :

```apache
<VirtualHost *:80>
    ServerName demarche.jeangi.org
    DocumentRoot /var/www/demarche
    AddDefaultCharset utf-8
    <Directory /var/www/demarche>
        Require all granted
    </Directory>
    Header set Cache-Control "no-cache"
</VirtualHost>
```

Active-le, puis active le HTTPS :

```sh
sudo a2enmod headers
sudo a2ensite demarche.jeangi.org
sudo apache2ctl configtest && sudo systemctl reload apache2
sudo apt install certbot python3-certbot-apache   # si certbot n'est pas déjà installé
sudo certbot --apache -d demarche.jeangi.org
```

#### Caddy

Caddy active le HTTPS tout seul. Ajoute ce bloc au fichier `/etc/caddy/Caddyfile` :

```
demarche.jeangi.org {
    root * /var/www/demarche
    file_server
    header Cache-Control "no-cache"
}
```

Recharge ensuite Caddy avec `sudo systemctl reload caddy`.

#### Pare-feu

Si le VPS a un pare-feu, les ports 80 et 443 doivent être ouverts. Avec `ufw` et nginx, lance
`sudo ufw allow 'Nginx Full'` ; avec Apache, `sudo ufw allow 'Apache Full'`.

## À chaque nouvelle version : déposer le fichier

1. **Préparer la version.** Ouvre le fichier principal `demarche.html`, puis le Mode
   professeur. Règle les exemples et ce qui s'affiche à l'ouverture, puis clique sur
   **Enregistrer une version pour les élèves**. Tu obtiens `demarche-eleves.html`.
2. **Le déposer sur le VPS sous le nom `index.html`.** C'est ce nom qui fait que l'adresse
   s'ouvre directement sur l'application. Deux façons de faire :
   - **En ligne de commande.** Cela marche dans le PowerShell de Windows 10 ou 11, sur macOS et
     sur Linux. Place-toi dans le dossier où se trouve le fichier (`cd Downloads` sous Windows et
     macOS, `cd Téléchargements` sous Linux en français), puis lance :
     ```sh
     scp demarche-eleves.html prof@ADRESSE-DU-VPS:/var/www/demarche/index.html
     ```
     `scp` se connecte comme `ssh`, avec les mêmes informations :

     | Pour te connecter, tu tapes… | … alors, pour déposer, tu tapes |
     | --- | --- |
     | `ssh debian@203.0.113.10` | `scp demarche-eleves.html debian@203.0.113.10:/var/www/demarche/index.html` |
     | `ssh -p 2222 debian@203.0.113.10` | `scp -P 2222 demarche-eleves.html debian@203.0.113.10:/var/www/demarche/index.html` (`P` majuscule) |
     | `ssh -i macle debian@203.0.113.10` | `scp -i macle demarche-eleves.html debian@203.0.113.10:/var/www/demarche/index.html` |
     | `ssh monvps` (nom défini dans `~/.ssh/config`) | `scp demarche-eleves.html monvps:/var/www/demarche/index.html` |

     Si le navigateur a renommé le fichier (`demarche-eleves (1).html`), écris ce nom entre
     guillemets.

     Si tu te connectes avec **PuTTY**, la commande `scp` de PowerShell ne connaît pas ta clé
     PuTTY. Utilise plutôt WinSCP, qui reprend tes sessions PuTTY : menu Outils, puis « Importer
     des sites ».
   - **Avec un logiciel de transfert** (FileZilla, WinSCP, Cyberduck). Dans FileZilla, passe par
     le Gestionnaire de sites (menu Fichier, puis « Nouveau site »), avec :
     - Protocole : **SFTP – SSH File Transfer Protocol**, et non FTP : le VPS n'a pas de serveur
       FTP ;
     - Hôte : l'adresse du VPS ; Port : 22, ou celui que tu donnes à `ssh -p` ;
     - Identifiant : le même compte que pour `ssh` ;
     - Type d'authentification : « Fichier de clés » si tu te connectes en SSH sans taper de mot de
       passe. Choisis alors ta clé privée, par exemple `C:\Users\<toi>\.ssh\id_ed25519` (ou
       `id_rsa`), ou ton fichier `.ppk` de PuTTY. Sinon, « Normale » avec ton mot de passe.

     Dépose ensuite le fichier dans `/var/www/demarche`, sous le nom `index.html`, à la place de
     l'ancien.
3. **Vérifier.** Ouvre https://demarche.jeangi.org. Les élèves ont la nouvelle version en
   rechargeant la page.

## Bon à savoir

- **Les données des élèves restent chez eux.** La page fonctionne entièrement dans leur
  navigateur : leurs démarches ne sont pas envoyées au serveur. Il n'y a ni compte ni cookie, et
  les brouillons restent dans leur navigateur. « Enregistrer la démarche » crée un fichier sur
  leur ordinateur. Le serveur ne garde que son journal d'accès habituel.
- **Pas de Claude sur ce site.** Comme le fichier ouvert sur un ordinateur, la page traduit les
  démarches avec ses propres règles. L'aide de Claude n'existe que dans la version publiée sur
  claude.ai.
- **`#professeur` ne touche pas au serveur.** N'importe qui peut ouvrir le mode professeur en
  ajoutant `#professeur` à l'adresse, mais cela ne change que l'affichage dans son navigateur, et
  permet seulement d'enregistrer une copie chez soi. Le fichier du serveur ne change que quand tu
  le déposes de nouveau.

## En cas de souci

- **`nginx -t` signale `socket() [::]:80 failed (97: Address family not supported)`** : le VPS
  n'a pas d'IPv6. Retire la ligne `listen [::]:80;`.
- **`certbot` échoue** : le nom n'est pas encore pris en compte (vérifie avec `nslookup`), ou le
  port 80 est fermé par le pare-feu.
- **`scp` répond `Permission denied`** : le reste du message dit lequel des deux cas c'est.
  - `debian@203.0.113.10: Permission denied (publickey).`, ou le mot de passe est refusé : `scp`
    ne se connecte pas comme `ssh`. Reprends exactement ce que tu tapes après `ssh` : le compte,
    l'adresse, `-p` qui devient `-P`, et `-i` (voir le tableau ci-dessus).
  - `scp: dest open "/var/www/demarche/index.html": Permission denied` (ou, avec une ancienne
    version, `scp: /var/www/demarche/index.html: Permission denied`) : la connexion marche, mais
    le dossier, ou un `index.html` déjà là, appartient à un autre compte, souvent root. Refais
    l'étape 2, avec `chown -R`.
- **`Connection refused`** : le SSH du VPS n'écoute pas sur le port 22. Donne à `scp` le même port
  qu'à `ssh`, avec `-P` (majuscule).
- **FileZilla ne se connecte pas** : vérifie le protocole (SFTP, pas FTP), le port, le compte et le
  type d'authentification (« Fichier de clés » si tu te connectes sans mot de passe).
- **L'ancienne version s'affiche encore** : recharge la page avec Ctrl + F5. La ligne
  `Cache-Control "no-cache"` évite normalement ce souci.
