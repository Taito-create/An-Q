import os, re

target_files = [
    'app/browse.tsx', 'app/calendar.tsx', 'app/create.tsx', 'app/devmode.tsx',
    'app/feedback.tsx', 'app/gacha.tsx', 'app/inbox.tsx', 'app/index.tsx',
    'app/manage.tsx', 'app/multi.tsx', 'app/profile.tsx', 'app/quiz.tsx',
    'app/results.tsx', 'app/shop.tsx',
    'app/auth/loginScreen.tsx', 'app/context/QuestionsContext.tsx',
    'app/hooks/useQuestions.ts', 'app/utils/answerUtils.ts',
    'src/App.tsx', 'src/RootLayout.tsx',
    'app/create.tsx'
]

for filepath in target_files:
    fullpath = os.path.join('d:/JS', filepath)
    if not os.path.exists(fullpath):
        print(f'SKIP (not found): {filepath}')
        continue
    
    with open(fullpath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Find all Alert.alert calls
    lines = content.split('\n')
    alert_blocks = []
    
    i = 0
    while i < len(lines):
        line = lines[i]
        if 'Alert.alert(' in line:
            block_start = i
            # Collect the full block (until matching closing paren)
            block_lines = []
            depth = 0
            j = i
            while j < len(lines):
                for c in lines[j]:
                    if c == '(':
                        depth += 1
                    elif c == ')':
                        depth -= 1
                block_lines.append(lines[j])
                if depth == 0:
                    break
                j += 1
            
            block = '\n'.join(block_lines)
            block_end = j
            
            # Check if second arg is an object (starts with `{`)
            # Extract the arguments: Alert.alert(arg1, arg2, arg3)
            # First, find the position after the first argument
            text = block
            # Find first comma after the first argument
            paren_idx = text.find('(')
            rest = text[paren_idx+1:]
            
            # Parse: find first argument (could be string or expression)
            # Then find second argument
            depth = 0
            comma_positions = []
            for ci, c in enumerate(rest):
                if c == '(' or c == '{' or c == '[':
                    depth += 1
                elif c == ')' or c == '}' or c == ']':
                    depth -= 1
                elif c == ',' and depth == 0:
                    comma_positions.append(ci)
            
            if len(comma_positions) >= 1:
                first_arg_end = comma_positions[0]
                second_arg_start = first_arg_end + 1
                second_arg = rest[second_arg_start:].strip()
                
                # Check if second argument starts with `{` (object literal)
                if second_arg.startswith('{') and not second_arg.startswith('{/*'):
                    # This is likely the bug - object passed as second arg
                    print(f'\n=== BUG FOUND in {filepath} at line {block_start+1} ===')
                    for k in range(block_start, min(block_end+1, len(lines))):
                        print(f'  {k+1}: {lines[k]}')
                    
                    print('\n  Second arg appears to be an object:', second_arg[:80] + '...' if len(second_arg) > 80 else second_arg)
                    print()
            
            i = j + 1
        else:
            i += 1

print("\n=== Search complete ===")