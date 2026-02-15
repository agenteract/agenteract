export type TaskEntry = {
  name: string;
  description?: string;
};

/**
 * Parses the output of gradle tasks into a map of tasks keyed by section
 * @param output 
 */
export const parseGradleTasks = (output: string): Map<string, TaskEntry[]> => {
    const tasksMap = new Map<string, TaskEntry[]>();
    const lines = output.split('\n');
    
    // Find the start of the tasks section (double-lined header)
    let startIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('------------------------------------------------------------') &&
            i + 1 < lines.length && 
            lines[i + 1].startsWith('Tasks runnable from')) {
            startIndex = i + 2; // Skip the header and the closing dashes
            break;
        }
    }
    
    if (startIndex === -1) {
        return tasksMap;
    }
    
    let currentSection: string | null = null;
    
    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
        
        // Check if this is a section header (next line contains only dashes)
        if (nextLine && /^-+$/.test(nextLine.trim()) && line.trim()) {
            currentSection = line.trim();
            tasksMap.set(currentSection, []);
            i++; // Skip the underline
            continue;
        }
        
        // Parse task lines (only if we're in a section)
        if (currentSection && line.trim()) {
            // Task lines typically have format: "taskName - description" or just "taskName"
            const taskMatch = line.match(/^(\S+)(?:\s+-\s+(.+))?$/);
            if (taskMatch) {
                const [, name, description] = taskMatch;
                const tasks = tasksMap.get(currentSection) || [];
                tasks.push({
                    name: name.trim(),
                    description: description?.trim()
                });
                tasksMap.set(currentSection, tasks);
            }
        }
        
        // Stop processing at common end markers
        if (line.includes('To see all tasks and more detail') || 
            line.includes('BUILD SUCCESSFUL')) {
            break;
        }
    }
    
    return tasksMap;
}