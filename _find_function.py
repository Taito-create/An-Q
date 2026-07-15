with open('d:/JS/app/browse.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Search for handleRemove anywhere in file
idx = content.find('handleRemove')
if idx >= 0:
    prefix = content[:idx]
    line_num = prefix.count('\n') + 1
    start = max(0, idx - 50)
    end = min(len(content), idx + 200)
    snippet = content[start:end]
    print('=== FOUND handleRemove at line ' + str(line_num) + ' ===')
    print(snippet)
else:
    print('=== handleRemove NOT FOUND in file ===')

# Also search for handleRemoveQuestionFromFolder
idx2 = content.find('handleRemoveQuestionFromFolder')
if idx2 >= 0:
    print('\n=== handleRemoveQuestionFromFolder FOUND ===')
else:
    print('\n=== handleRemoveQuestionFromFolder NOT FOUND ===')

# Search for 'as any' pattern
idx3 = content.find('as any')
if idx3 >= 0:
    prefix = content[:idx3]
    line_num2 = prefix.count('\n') + 1
    start = max(0, idx3 - 100)
    end = min(len(content), idx3 + 50)
    print('\n=== as any found at line ' + str(line_num2) + ' ===')
    print(content[start:end])
else:
    print('\n=== as any NOT FOUND ===')

# Search for '{ text:' pattern near Alert.alert
idx4 = content.find('{ text:')
if idx4 >= 0:
    # Check if it's inside an Alert.alert second argument
    # Look backwards for Alert.alert
    before = content[max(0, idx4-200):idx4]
    if 'Alert.alert' in before:
        prefix = content[:idx4]
        line_num3 = prefix.count('\n') + 1
        start = max(0, idx4 - 150)
        end = min(len(content), idx4 + 200)
        print('\n=== { text: pattern near Alert.alert at line ' + str(line_num3) + ' ===')
        print(content[start:end])