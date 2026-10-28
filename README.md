# 7D Games · Feira de Ciências SENAI 2026

Landing page da equipe **7D Games** para a Feira de Ciências do SENAI. Ela apresenta os integrantes e os três projetos da equipe: dois jogos e uma corrida imersiva com carrinhos de controle remoto.

## Projetos

| Projeto | O que é | Quem fez |
| --- | --- | --- |
| **Brawl SENAI** | Jogo | Emannoel |
| **TRON** | Jogo | John |
| **Rocket SENAI** | Corrida imersiva: carrinhos de controle remoto com uma câmera ESP32-CAM em cima, que mostra a pista para quem está pilotando | Julio, Pedro e Vinícius |

## Equipe

| Nº | Integrante | Função |
| --- | --- | --- |
| 01 | Emannoel Henrique Soares | Brawl SENAI |
| 02 | Julio Aurélio Souza | Rocket SENAI |
| 03 | John Cristopher | TRON |
| 04 | Luiz Felipe | Banners |
| 05 | Pedro Henrique Vasconcelos | Rocket SENAI |
| 06 | Vinícius Mariozi Oliveira | Rocket SENAI e website |
| 07 | Yan Matheus Proença Camargo | Banners |

## Como abrir o site

O site é só HTML, CSS e JavaScript, sem etapa de build. Ele precisa ser aberto por um servidor, porque abrindo o `index.html` direto do arquivo o navegador bloqueia o modelo 3D. Use uma destas opções:

- **VS Code:** clique com o botão direito no `index.html` e escolha **Open with Live Server** (extensão Live Server).
- **Python:** na pasta do projeto, rode `python -m http.server 8000` e abra <http://localhost:8000>.

O three.js já está dentro do projeto, então o 3D funciona mesmo sem internet na feira. Só as fontes vêm do Google Fonts: sem internet, o navegador usa fontes parecidas no lugar.

## O que tem na página

- **Início:** o nome da equipe, os projetos numa tabela de classificação e os integrantes num grid de largada no estilo da F1. Passar o mouse num projeto destaca quem fez.
- **Brawl SENAI** e **TRON:** uma seção para cada jogo, com o visual do próprio jogo.
- **Rocket SENAI:** carros em 3D que reagem à rolagem da página.
  - Primeiro a SF-26 gira, inclina nos eixos X, Y e Z e se desmonta.
  - Depois mostra onde fica a ESP32-CAM: em cima do carro.
  - Em seguida, a SF-26 e um Mini Cooper largam lado a lado com as cinco luzes e disputam posição numa pista noturna.
  - Por fim, a imagem passa para a câmera em cima da SF-26, com a câmera do Mini num quadro menor no canto.

O 3D só é desenhado enquanto algo se mexe. Ele também reduz a resolução sozinho se o computador não der conta. Quem ativa a opção "menos movimento" no sistema não vê as animações.

## Estrutura

```
index.html             página única
css/style.css          estilos de todas as seções
js/main.js             revelar ao rolar, menu e destaque da seção atual
js/rocket.js           3D do Rocket SENAI (cenas, pista, corrida e painel)
js/vendor/three/       three.js 0.172.0 (local, para funcionar offline)
img/3d_model/          modelos 3D dos carros
img/rocket-poster.webp imagem mostrada enquanto o 3D carrega
img/equipe/            fotos dos integrantes usadas no site
img/LEIA-ME.txt        nomes das fotos e como ligar cada pessoa ao projeto
```

## Fotos dos integrantes

As fotos que o site usa ficam em `img/equipe/`, já recortadas e otimizadas a partir das originais em `img/integrantes/`:

- **De macacão de F1** (`<nome>-f1.webp`): os sete integrantes, no grid de largada do início.
- **De terno** (`<nome>-terno.webp`): Emannoel na seção do Brawl SENAI, John na do TRON e Julio, Pedro e Vinícius na equipe do Rocket SENAI.

Enquanto uma foto não existir, aparece o número da pessoa (ou as iniciais) no lugar. Os detalhes estão em [img/LEIA-ME.txt](img/LEIA-ME.txt).

## Publicação

O site usa só as versões otimizadas dos carros: `img/3d_model/sf-26-web.glb` (9,6 MB) e `img/3d_model/mini-cooper-web.glb` (1,3 MB). Os arquivos `2026_ferrari_sf-26.glb` (19 MB) e `mini_cooper_s.glb` (4,6 MB) são os originais e podem ficar de fora na hora de publicar, assim como as fotos originais em `img/integrantes/`.

## Créditos

- Modelos 3D, ambos sob a licença [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), otimizados para a web e com as rodas separadas para a animação:
  - [2026 Ferrari SF-26](https://sketchfab.com/3d-models/2026-ferrari-sf-26-e5ca6cecdc42449283f4bed27360f2a7), por [Dave Love](https://sketchfab.com/Tyler_Dave);
  - [Mini Cooper S](https://sketchfab.com/3d-models/mini-cooper-s-7d407f7a1db44fefb206d17e12680576), por [シRuletăシ](https://sketchfab.com/romanian_guy_0069).
- [three.js](https://threejs.org/), sob a licença MIT (veja `js/vendor/three/LICENSE`).
- Fontes: Saira, Unbounded, Orbitron e Lilita One, do Google Fonts.
