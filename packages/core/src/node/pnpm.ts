/**
 * if we're running in the agenteract monorepo, set node's CWD back to the original working directory
 * otherwise pnpm commands have CWD set to the monorepo root
 */
export function resetPNPMWorkspaceCWD() {
    if (process.env.PNPM_PACKAGE_NAME == 'agenteract' && process.env.PWD && process.env.PWD !== process.cwd()) {
        process.chdir(process.env.PWD!);
    }
}
