# elChore

Storymap editorial inspirado en la reserva El Chore.

El proyecto esta preparado para publicarse como sitio estatico en GitHub Pages.

## Abrir en local

```bash
python -m http.server 3000
```

Luego abre `http://localhost:3000`.

## Publicacion en GitHub Pages

GitHub Pages publica solamente archivos estaticos.

En este repositorio, el sitio publicado ya puede servirse directamente desde la raiz.

## Estructura

- `index.html`: estructura principal del storymap publicada en la raiz
- `styles.css`: estilos y composición visual
- `app.js`: animaciones, línea temporal y comportamiento del mapa
- `data/`, `generated/`, `images/`: insumos y recursos estaticos usados por la pagina

## Siguiente paso sugerido

Reemplazar el mapa ilustrativo por datos reales de MapBiomas Bolivia, GeoJSON o raster tiles para convertir esta maqueta en un storymap analítico completo.
