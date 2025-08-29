**Eloquent Visualizer**

Visualiza las relaciones de tus modelos Eloquent en proyectos Laravel de
forma interactiva y sencilla, directamente dentro de VS Code.

**Nota:** Reemplaza la URL de la imagen de arriba con un GIF de
demostración real en tu repositorio.

**¿Por qué Eloquent Visualizer?**

Navegar por las complejas relaciones de un proyecto Laravel puede ser un
desafío. Eloquent Visualizer te ayuda a entender la arquitectura de tu
base de datos de un vistazo, generando un grafo interactivo de cómo se
conectan tus modelos. ¡Ideal para desarrolladores nuevos en un proyecto
o para documentar tu propia aplicación!

**Características Principales**

- **Detección Automática**: Escanea tu proyecto (app/ y app/Models/)
  para encontrar todos tus modelos Eloquent automáticamente.

- **Visualización de Relaciones**: Muestra claramente relaciones como
  hasOne, hasMany, belongsTo, belongsToMany, y más.

- **Grafo Interactivo**: Arrastra, haz zoom, y reorganiza los nodos para
  explorar las conexiones a tu manera.

- **Navegación Rápida**: Haz doble clic en cualquier modelo del gráfico
  para abrir el archivo PHP correspondiente al instante.

- **Análisis Enfocado**: Selecciona uno o más modelos y aíslalos para
  centrarte en una parte específica de tu esquema.

- **Exportación a PNG**: Guarda una imagen de alta resolución de tu
  gráfico de relaciones para documentación o para compartir con tu
  equipo.

- **Búsqueda Integrada**: Encuentra rápidamente cualquier modelo en el
  gráfico usando el buscador.

**Cómo Empezar**

1.  **Instala la Extensión**: Búscala como \"Eloquent Visualizer\" en el
    Marketplace de VS Code e instálala.

2.  **Abre tu Proyecto Laravel**: Asegúrate de tener la carpeta raíz de
    tu proyecto Laravel abierta en VS Code.

3.  **Ejecuta el Comando**: Abre la Paleta de Comandos (Ctrl+Shift+P o
    Cmd+Shift+P) y escribe Eloquent Visualizer: Mostrar Gráfico de
    Relaciones.

¡Y listo! Se abrirá una nueva pestaña con el grafo interactivo de tus
modelos.

**Requisitos**

- Visual Studio Code 1.80 o superior.

- Un proyecto basado en Laravel con modelos Eloquent.

**Problemas Conocidos**

- El parseador de relaciones se basa en expresiones regulares y podría
  no detectar relaciones definidas de maneras muy inusuales o dinámicas.

**¡Disfruta visualizando tus modelos!**