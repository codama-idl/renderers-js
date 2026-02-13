import { deleteDirectory, joinPath, mapRenderMapContentAsync, writeRenderMap } from '@codama/renderers-core';
import { rootNodeVisitor, visit } from '@codama/visitors-core';

import { getCodeFormatter, RenderOptions, syncPackageJson } from '../utils';
import { getRenderMapVisitor } from './getRenderMapVisitor';

export function renderVisitor(packageFolder: string, options: RenderOptions = {}) {
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
