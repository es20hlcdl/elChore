# elChore

Storymap editorial inspirado en la reserva El Chore.

El proyecto esta preparado para publicarse como sitio estatico en GitHub Pages.

## Abrir en local

```bash
python -m http.server 3000
```

Luego abre `http://localhost:3000/public/`.

## Publicacion en GitHub Pages

GitHub Pages publica solamente archivos estaticos.

En este repositorio, la raiz incluye un `index.html` que redirige al sitio real ubicado en
`public/`, para que Pages pueda mostrar el storymap correctamente.

## Estructura

- `index.html`: redireccion desde la raiz del repositorio hacia `public/`
- `public/index.html`: estructura del storymap
- `public/styles.css`: estilos y composición visual
- `public/app.js`: animaciones, línea temporal y comportamiento del mapa

## Siguiente paso sugerido

Reemplazar el mapa ilustrativo por datos reales de MapBiomas Bolivia, GeoJSON o raster tiles para convertir esta maqueta en un storymap analítico completo.
