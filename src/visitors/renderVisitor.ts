import { deleteDirectory, joinPath, mapRenderMapContentAsync, writeRenderMap } from '@codama/fragments';
import { rootNodeVisitor, visit, Visitor } from '@codama/visitors-core';

import { getCodeFormatter, RenderOptions, syncPackageJson } from '../utils';
import { getRenderMapVisitor } from './getRenderMapVisitor';

/**
 * Creates a visitor generating the JavaScript client of a Codama tree into a package folder:
 * it renders every file, formats them, syncs the `package.json` and writes them into the
 * generated folder, `src/generated` by default.
 *
 * @param packageFolder - The folder of the package, where its `package.json` lives.
 * @param options - The options controlling the generated code and how it is written.
 * @return The visitor writing the client.
 *
 * @example
 * ```ts
 * await visit(root, renderVisitor('clients/js', { kitImportStrategy: 'rootOnly' }));
 * ```
 */
export function renderVisitor(packageFolder: string, options: RenderOptions = {}): Visitor<Promise<void>, 'rootNode'> {
    return rootNodeVisitor(async root => {
        const generatedFolder = joinPath(packageFolder, options.generatedFolder ?? 'src/generated');

        // Delete existing generated folder.
        if (options.deleteFolderBeforeRendering ?? true) {
            deleteDirectory(generatedFolder);
        }

        // Render the new files.
        let renderMap = visit(root, getRenderMapVisitor(options));

        // Format the code, if requested.
        const formatCode = await getCodeFormatter(packageFolder, options);
        renderMap = await mapRenderMapContentAsync(renderMap, formatCode);

        // Create or update package.json dependencies, if requested.
        await syncPackageJson(renderMap, formatCode, packageFolder, options);

        // Write the rendered files to the output directory.
        writeRenderMap(renderMap, generatedFolder);
    });
}
