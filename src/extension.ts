import * as vscode from 'vscode';

/**
 * Esta función se llama cuando tu extensión es activada.
 * @param context El contexto de la extensión.
 */
export function activate(context: vscode.ExtensionContext) {

    let disposable = vscode.commands.registerCommand('eloquent-visualizer.show', async () => {
		// Crear y mostrar un nuevo panel web
		const panel = vscode.window.createWebviewPanel(
			'eloquentVisualizer', // Identificador interno del panel.
			'Eloquent Visualizer PRO', // Título que se muestra al usuario en la pestaña.
			vscode.ViewColumn.One, // Columna donde se mostrará el panel.
			{
                // Habilitar scripts en el webview
                enableScripts: true,
                // Mantener el contexto del webview vivo incluso cuando no está visible.
                retainContextWhenHidden: true,
                // Restringir el webview a cargar recursos solo desde nuestro directorio 'media'.
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
            }
		);

		// Obtener y parsear los modelos del proyecto.
		const models = await findAndParseModels();
		// Establecer el contenido HTML para el webview.
		panel.webview.html = getWebviewContent(models);

		// Manejar mensajes desde el webview (ej. clic en un nodo o exportar).
		panel.webview.onDidReceiveMessage(
			async message => { // Se convierte en una función asíncona para usar await
				switch (message.command) {
					case 'openFile':
						// Abrir el archivo del modelo correspondiente en el editor.
						vscode.workspace.openTextDocument(message.path).then(doc => {
							vscode.window.showTextDocument(doc);
						});
						return;
                    
                    case 'exportPNG':
                        // Abrir un diálogo para guardar el archivo.
                        const saveUri = await vscode.window.showSaveDialog({
                            defaultUri: vscode.Uri.joinPath(vscode.workspace.workspaceFolders?.[0].uri ?? vscode.Uri.file('.'), 'eloquent-graph.png'),
                            filters: { 'PNG Images': ['png'] }
                        });
        
                        if (saveUri) {
                            // El dataURL viene en formato 'data:image/png;base64,xxxxxxxx...'
                            // Extraemos solo la parte que corresponde a los datos en base64.
                            const base64Data = message.data.replace(/^data:image\/png;base64,/, '');
                            const fileData = Buffer.from(base64Data, 'base64');
                            
                            try {
                                // Escribir el archivo en la ubicación seleccionada.
                                await vscode.workspace.fs.writeFile(saveUri, fileData);
                                vscode.window.showInformationMessage('¡Gráfico exportado exitosamente!');
                            } catch (err) {
                                vscode.window.showErrorMessage(`Error al guardar el archivo: ${err}`);
                            }
                        }
                        return;
				}
			},
			undefined,
			context.subscriptions
		);
	});

    context.subscriptions.push(disposable);
}

/**
 * Busca y analiza los archivos de modelos de Eloquent en el espacio de trabajo.
 * @returns Un objeto con nodos (modelos) y aristas (relaciones).
 */
async function findAndParseModels() {
    // Verificar si hay una carpeta de proyecto abierta.
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage("Eloquent Visualizer: Por favor, abre una carpeta de proyecto Laravel para que la extensión funcione.");
        return { nodes: [], edges: [] };
    }
    
    const folderPath = vscode.workspace.workspaceFolders[0].uri.fsPath;

    // Buscar archivos de modelos en las carpetas comunes de Laravel.
    const modelFiles = await vscode.workspace.findFiles('{app/Models/**/*.php,app/*.php}', '**/vendor/**');

    if (modelFiles.length === 0) {
        vscode.window.showInformationMessage(`Eloquent Visualizer: No se encontraron modelos en ${folderPath}. Asegúrate de que estén en 'app/Models/' o 'app/'.`);
    }
    
    let modelsData: { nodes: any[], edges: any[] } = {
        nodes: [],
        edges: []
    };

    // Expresión regular para extraer el namespace y el nombre de la clase del modelo.
    const classRegex = /namespace\s+([^;]+);[\s\S]*?class\s+([^\s]+)\s+/m;
    // Expresión regular mejorada para capturar el nombre de la función de la relación, el tipo y el modelo relacionado.
    const relationshipRegex = /public\s+function\s+(\w+)\s*\(\)\s*\{[\s\S]*?->(hasOne|hasMany|belongsTo|belongsToMany|morphTo|morphOne|morphMany|morphToMany|hasOneThrough|hasManyThrough)\s*\(\s*([^\s,)]+)::class/g;
    
    for (const file of modelFiles) {
        const fileContent = (await vscode.workspace.fs.readFile(file)).toString();
        const classMatch = classRegex.exec(fileContent);

        if (!classMatch) continue;

        const [ , namespace, className] = classMatch;
        const fullClassName = `${namespace}\\${className}`;
        modelsData.nodes.push({ id: fullClassName, label: className, path: file.fsPath, title: `Path: ${file.fsPath}` });
        
        // Extraer todas las declaraciones 'use' para resolver los nombres de los modelos relacionados.
        const useStatements = new Map<string, string>();
        const useRegex = /use\s+([^;]+);/g;
        let useMatch;
        while ((useMatch = useRegex.exec(fileContent)) !== null) {
            const fullPath = useMatch[1].trim();
            const alias = fullPath.split('\\').pop() || '';
            if (alias) {
                useStatements.set(alias, fullPath);
            }
        }
        
        let match;
        while ((match = relationshipRegex.exec(fileContent)) !== null) {
            const [ , relationshipName, relationshipType, relatedModelText] = match;
            
            let relatedModelFullName: string;

            if (relatedModelText.startsWith('\\')) {
                // El nombre del modelo es un namespace completo.
                relatedModelFullName = relatedModelText.substring(1);
            } else {
                const classNameOnly = relatedModelText.split('\\').pop()!;
                if (useStatements.has(classNameOnly)) {
                    // Se encontró una declaración 'use' para este modelo.
                    relatedModelFullName = useStatements.get(classNameOnly)!;
                } else {
                    // Se asume que el modelo está en el mismo namespace.
                    relatedModelFullName = `${namespace}\\${classNameOnly}`;
                }
            }

            modelsData.edges.push({
                from: fullClassName,
                to: relatedModelFullName,
                label: relationshipName, // Usar el nombre de la función como etiqueta.
                title: `Type: ${relationshipType}` // Mostrar el tipo de relación en el tooltip.
            });
        }
    }
    return modelsData;
}

/**
 * Genera el contenido HTML para el panel web.
 * @param data Los datos de los modelos y relaciones.
 * @returns Una cadena con el contenido HTML.
 */
function getWebviewContent(data: { nodes: any[], edges: any[] }) {
    const stringifiedData = JSON.stringify(data);

    return `<!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Eloquent Visualizer</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
        <style>
            body, html {
                height: 100%; margin: 0; padding: 0; overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background-color: #1e1e1e; color: #d4d4d4;
            }
            .header {
                background-color: #252526; padding: 10px 20px;
                display: flex; align-items: center; gap: 10px;
                height: 60px; border-bottom: 1px solid #333333;
            }
            .header h1 { color: #cccccc; font-size: 16px; font-weight: 500; margin-right: auto; }
            .btn {
                background-color: #3a3d41; color: #cccccc; padding: 6px 12px;
                border: 1px solid #4a4a4a; border-radius: 5px; cursor: pointer;
                font-size: 13px; transition: all 0.2s ease; white-space: nowrap;
                display: flex; align-items: center; gap: 6px;
            }
            .btn:hover:not(:disabled) { background-color: #4a4a4a; border-color: #5a5a5a; }
            .btn:disabled { opacity: 0.5; cursor: not-allowed; }
            .btn-primary { background-color: #0e639c; border-color: #0e639c; color: white; }
            .btn-primary:hover:not(:disabled) { background-color: #1177bb; border-color: #1177bb; }
            .btn-danger { background-color: #c93c3c; border-color: #c93c3c; color: white; }
            .btn-danger:hover:not(:disabled) { background-color: #e04a4a; border-color: #e04a4a; }
            .search-container, .edge-controls { display: flex; align-items: center; gap: 5px; }
            .search-box {
                background-color: #3c3c3c; border: 1px solid #4a4a4a;
                border-radius: 5px; color: #cccccc; padding: 6px 10px;
                font-size: 13px; width: 180px;
            }
            .search-box:focus { outline: none; border-color: #0e639c; }
            .checkbox-label, .edge-controls label { display: flex; align-items: center; gap: 5px; font-size: 13px; cursor: pointer; }
            #mynetwork { height: calc(100vh - 60px); width: 100%; background-color: #1e1e1e; }
            div.vis-tooltip {
                background-color: #252526; border: 1px solid #333; color: #d4d4d4;
                padding: 10px; border-radius: 5px; box-shadow: 0 4px 8px rgba(0,0,0,0.5);
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Eloquent Visualizer</h1>
            <div id="edge-editor" class="edge-controls" style="display: none;">
                <label for="roundness-slider">Curvatura:</label>
                <input type="range" id="roundness-slider" min="-1.5" max="1.5" step="0.05" style="width: 80px;">
            </div>
            <div class="search-container">
                <input type="text" id="search-input" class="search-box" placeholder="Buscar modelo...">
                <button id="search-btn" class="btn btn-primary" title="Buscar modelo">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                </button>
                <label class="checkbox-label"><input type="checkbox" id="relations-checkbox"> Relaciones</label>
            </div>
            <button id="isolate-btn" class="btn" disabled title="Aislar Selección">Aislar</button>
            <button id="delete-btn" class="btn btn-danger" disabled title="Eliminar Selección (Supr)">Eliminar</button>
            <button id="reorder-btn" class="btn" title="Reorganizar el gráfico">Reordenar</button>
            <button id="reset-btn" class="btn" title="Restaurar el gráfico original">Reiniciar</button>
            <button id="export-btn" class="btn" title="Exportar vista actual como PNG">Exportar</button>
        </div>
        <div id="mynetwork"></div>

        <script type="text/javascript">
            const vscode = acquireVsCodeApi();
            const deepOriginalData = JSON.parse(${JSON.stringify(stringifiedData)});

            function processEdges(edgesData) {
                const processed = JSON.parse(JSON.stringify(edgesData)); // Deep copy
                const edgeGroups = {};
                processed.forEach(edge => {
                    const key = [edge.from, edge.to].sort().join('--');
                    if (!edgeGroups[key]) edgeGroups[key] = [];
                    edgeGroups[key].push(edge);
                });

                Object.values(edgeGroups).forEach(group => {
                    if (group.length > 1) {
                        const step = 0.35;
                        group.forEach((edge, index) => {
                            const roundness = (index - (group.length - 1) / 2) * step;
                            edge.smooth = { enabled: true, type: 'curvedCW', roundness };
                        });
                    }
                });
                return processed;
            }

            const initialNodes = new vis.DataSet(deepOriginalData.nodes);
            const initialEdges = new vis.DataSet(processEdges(deepOriginalData.edges));
            
            const container = document.getElementById('mynetwork');
            const options = {
                nodes: {
                    shape: 'box', margin: 12, font: { color: '#e0e0e0', size: 14 },
                    color: {
                        border: '#4a5568', background: '#2d3748',
                        highlight: { border: '#63b3ed', background: '#4299e1' },
                        hover: { border: '#63b3ed', background: '#3182ce' }
                    },
                    shadow: true
                },
                edges: {
                    width: 2,
                    font: { color: '#a0aec0', size: 12, align: 'middle', strokeWidth: 4, strokeColor: '#1e1e1e' },
                    arrows: 'to',
                    color: { color: '#4a5568', highlight: '#63b3ed', hover: '#38b2ac' },
                    smooth: { enabled: true, type: "dynamic" }
                },
                physics: { enabled: true, solver: 'forceAtlas2Based', stabilization: { iterations: 150 } },
                interaction: {
                    tooltipDelay: 200, hideEdgesOnDrag: true, navigationButtons: true,
                    multiselect: true, hover: true, selectable: true, 
                    selectConnectedEdges: true // <-- CORRECCIÓN: Seleccionar aristas conectadas
                },
                layout: { improvedLayout: true }
            };
            const network = new vis.Network(container, { nodes: initialNodes, edges: initialEdges }, options);

            // --- GESTIÓN DE EVENTOS Y CONTROLES ---
            const isolateBtn = document.getElementById('isolate-btn');
            const deleteBtn = document.getElementById('delete-btn');
            const searchInput = document.getElementById('search-input');
            const searchBtn = document.getElementById('search-btn');
            const relationsCheckbox = document.getElementById('relations-checkbox');
            const edgeEditor = document.getElementById('edge-editor');
            const roundnessSlider = document.getElementById('roundness-slider');
            
            network.on("stabilizationIterationsDone", () => network.setOptions({ physics: false }));
            
            network.on("select", (params) => {
                const { nodes, edges } = params;
                const hasSelection = nodes.length > 0 || edges.length > 0;
                isolateBtn.disabled = nodes.length === 0;
                deleteBtn.disabled = !hasSelection;

                if (edges.length === 1) { // Mostrar slider solo si se selecciona UNA arista
                    const firstEdge = network.body.data.edges.get(edges[0]);
                    roundnessSlider.value = firstEdge.smooth?.roundness || 0;
                    edgeEditor.style.display = 'flex';
                } else {
                    edgeEditor.style.display = 'none';
                }
            });
            
            network.on("doubleClick", (params) => {
                if (params.nodes.length > 0) {
                    const node = initialNodes.get(params.nodes[0]);
                    if (node && node.path) vscode.postMessage({ command: 'openFile', path: node.path });
                }
            });

            network.on("dragStart", (params) => {
                if (params.nodes.length > 0) {
                    network.setOptions({ physics: false });
                    const mainNodeId = params.nodes[0];
                    if (!network.getSelection().nodes.includes(mainNodeId)) {
                        const nodesToSelect = [mainNodeId, ...network.getConnectedNodes(mainNodeId)];
                        network.setSelection({ nodes: nodesToSelect });
                    }
                }
            });

            // <-- CORRECCIÓN: Prevenir paneo fantasma
            network.on("dragEnd", function () {
                // Capturar este evento evita que la red entre en modo de paneo accidentalmente
                // después de interactuar con un elemento.
            });

            roundnessSlider.addEventListener('input', (e) => {
                const newRoundness = parseFloat(e.target.value);
                const selectedEdges = network.getSelection().edges;
                if (selectedEdges.length > 0) {
                    const updates = selectedEdges.map(id => ({
                        id: id, smooth: { enabled: true, type: 'curvedCW', roundness: newRoundness }
                    }));
                    network.body.data.edges.update(updates);
                }
            });

            const handleSearch = () => {
                const searchTerm = searchInput.value.toLowerCase();
                if (!searchTerm) return;
                
                const foundNode = initialNodes.get({ filter: item => item.label.toLowerCase().includes(searchTerm) })[0];
                if (!foundNode) return;

                let nodeIdsToShow = [foundNode.id];
                if (relationsCheckbox.checked) {
                    nodeIdsToShow.push(...network.getConnectedNodes(foundNode.id));
                }
                const nodesToShow = new vis.DataSet(initialNodes.get(nodeIdsToShow));
                const edgesToShow = new vis.DataSet(initialEdges.get({ filter: e => nodeIdsToShow.includes(e.from) && nodeIdsToShow.includes(e.to) }));
                network.setData({ nodes: nodesToShow, edges: edgesToShow });
                network.setSelection({ nodes: nodeIdsToShow });
                network.fit();
            };
            searchBtn.addEventListener('click', handleSearch);
            searchInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleSearch(); });

            const deleteSelection = () => {
                const { nodes: nodeIds, edges: edgeIds } = network.getSelection();
                if (nodeIds.length > 0) network.body.data.nodes.remove(nodeIds);
                if (edgeIds.length > 0) network.body.data.edges.remove(edgeIds);
            };
            deleteBtn.addEventListener('click', deleteSelection);
            window.addEventListener('keydown', (e) => { if (e.key === 'Delete') deleteSelection(); });

            isolateBtn.addEventListener('click', () => {
                const selectedNodesIds = network.getSelection().nodes;
                if (selectedNodesIds.length === 0) return;
                const nodesToShow = new vis.DataSet(initialNodes.get(selectedNodesIds));
                const edgesToShow = new vis.DataSet(initialEdges.get({ filter: e => selectedNodesIds.includes(e.from) && selectedNodesIds.includes(e.to) }));
                network.setData({ nodes: nodesToShow, edges: edgesToShow });
                network.fit();
            });

            document.getElementById('reorder-btn').addEventListener('click', () => {
                network.setOptions({ physics: true });
                setTimeout(() => network.setOptions({ physics: false }), 2500);
            });

            document.getElementById('reset-btn').addEventListener('click', () => {
                const freshNodes = new vis.DataSet(deepOriginalData.nodes);
                const freshEdges = new vis.DataSet(processEdges(deepOriginalData.edges));
                network.setData({ nodes: freshNodes, edges: freshEdges });
                network.setOptions({ physics: true });
                setTimeout(() => network.setOptions({ physics: false }), 2500);
            });
            
            document.getElementById('export-btn').addEventListener('click', () => {
                sendCanvasAsPNG(container.getElementsByTagName('canvas')[0]);
            });

            function sendCanvasAsPNG(canvas) {
                const tempCanvas = document.createElement('canvas');
                const scale = 2; // Alta resolución
                tempCanvas.width = canvas.width * scale;
                tempCanvas.height = canvas.height * scale;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.scale(scale, scale);
                tempCtx.fillStyle = '#1e1e1e';
                tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                tempCtx.drawImage(canvas, 0, 0);
                vscode.postMessage({ command: 'exportPNG', data: tempCanvas.toDataURL('image/png') });
            }
        </script>
    </body>
    </html>`;
}

/**
 * Esta función se llama cuando tu extensión es desactivada.
 */
export function deactivate() {}