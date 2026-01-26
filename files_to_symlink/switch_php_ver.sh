php-switch() {
    # List installed PHP versions
    INSTALLED_VERSIONS=$(find /opt/homebrew/opt | grep 'php@' | sed 's/\/opt\/homebrew\/opt\/php@//')

    # If no argument is provided, prompt availalbe version(s)
    if [ $# -eq 0 ]; then
        if [ -z "$INSTALLED_VERSIONS" ]; then
            echo "No PHP versions are installed."
            return 1
        fi

        echo "Available PHP version(s):"
        select VERSION in $INSTALLED_VERSIONS; do
            if [[ -n "$VERSION" ]]; then
                echo "You selected PHP $VERSION."
                break
            else
                echo "Invalid selection. Please choose a valid version."
            fi
        done
    else
        # Use the provided PHP version
        VERSION=$1
    fi

    # Check if the provided version exists
    if [[ ! -f /opt/homebrew/opt/php@${VERSION}/bin/php ]]; then
        echo 1>&2 "/opt/homebrew/opt/php@${VERSION}/bin/php was not found"
        echo "Valid options:"
        printf '%s\n' ${INSTALLED_VERSIONS[@]}
        return 2
    fi

    # Unlink and stop all other PHP versions
    for INSTALLED_VERSION in ${INSTALLED_VERSIONS[@]}; do
        brew unlink php@$INSTALLED_VERSION > /dev/null 2>&1
        brew services stop php@$INSTALLED_VERSION > /dev/null 2>&1
    done

    # Link and start the selected PHP version
    brew link --force --overwrite php@$VERSION > /dev/null 2>&1
    brew services start php@$VERSION > /dev/null 2>&1

    echo "Switched to PHP $VERSION."
}

php-switch "$@"
